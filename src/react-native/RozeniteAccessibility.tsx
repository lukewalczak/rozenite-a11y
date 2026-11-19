import { createRozeniteRpc, useRozeniteDevToolsClient } from '@rozenite/plugin-bridge';
import { useCallback, useEffect, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { AccessibilityInfo, PixelRatio, Platform, StyleSheet, View } from 'react-native';
import {
  ACCESSIBILITY_PLUGIN_ID,
  DEVICE_READY_EVENT,
  type AccessibilityMethods,
} from '../shared/messaging';
import type { AccessibilityAudit, AccessibilitySystemState, Frame } from '../shared/types';
import { useAccessibilityAgentTools } from './agent-tools';
import { auditHostTree } from './audit';
import { collectHostNodes } from './host-tree';
import { getFiberRoots, measureHostInstance } from './runtime';

const HIGHLIGHT_COLOR = '#ff4f7b';

// Some of these settings exist on one platform only, and a query for a
// missing one must not fail the whole audit.
const readSetting = (read: () => Promise<boolean>): Promise<boolean> => {
  try {
    return read().catch(() => false);
  } catch {
    return Promise.resolve(false);
  }
};

const getSystemState = async (): Promise<AccessibilitySystemState> => {
  const [
    screenReaderEnabled,
    reduceMotionEnabled,
    boldTextEnabled,
    grayscaleEnabled,
    invertColorsEnabled,
    reduceTransparencyEnabled,
  ] = await Promise.all([
    readSetting(() => AccessibilityInfo.isScreenReaderEnabled()),
    readSetting(() => AccessibilityInfo.isReduceMotionEnabled()),
    readSetting(() => AccessibilityInfo.isBoldTextEnabled()),
    readSetting(() => AccessibilityInfo.isGrayscaleEnabled()),
    readSetting(() => AccessibilityInfo.isInvertColorsEnabled()),
    readSetting(() => AccessibilityInfo.isReduceTransparencyEnabled()),
  ]);

  return {
    screenReaderEnabled,
    reduceMotionEnabled,
    boldTextEnabled,
    grayscaleEnabled,
    invertColorsEnabled,
    reduceTransparencyEnabled,
    fontScale: PixelRatio.getFontScale(),
  };
};

const runAudit = async () => {
  const roots = getFiberRoots();
  if (!roots) {
    throw new Error(
      'The React DevTools hook is not available, so the component tree cannot be read.',
    );
  }

  const { elements, minTouchTarget, measureById } = auditHostTree(
    collectHostNodes(roots, measureHostInstance),
    Platform.OS,
    Platform.constants.reactNativeVersion,
  );

  const audit: AccessibilityAudit = {
    platform: Platform.OS,
    minTouchTarget,
    elements,
    system: await getSystemState(),
    takenAt: Date.now(),
  };
  return { audit, measureById };
};

/**
 * Connects the app to the Accessibility panel and to Rozenite agent tools, and
 * draws the outline of the selected element. Render it once, after the rest of
 * the app, so the outline ends up on top.
 */
export const RozeniteAccessibility = (): ReactNode => {
  const client = useRozeniteDevToolsClient({
    pluginId: ACCESSIBILITY_PLUGIN_ID,
  });
  const [highlight, setHighlight] = useState<Frame | null>(null);
  const containerRef = useRef<ComponentRef<typeof View>>(null);
  const measureByIdRef = useRef(new Map<string, () => Frame | null>());
  const latestAuditRef = useRef<AccessibilityAudit | null>(null);
  const highlightRequestRef = useRef(0);
  // An unmounted container never answers `measureInWindow`; this settles any
  // measurement still waiting on unmount so its request does not hang.
  const unmountedRef = useRef<Promise<null>>(new Promise(() => {}));

  useEffect(() => {
    let settle = () => {};
    unmountedRef.current = new Promise((resolve) => {
      settle = () => resolve(null);
    });
    return () => {
      highlightRequestRef.current++;
      settle();
    };
  }, []);

  const audit = useCallback(async () => {
    const result = await runAudit();
    measureByIdRef.current = result.measureById;
    latestAuditRef.current = result.audit;
    return result.audit;
  }, []);

  const highlightElement = useCallback(async (id: string | null): Promise<boolean> => {
    const request = ++highlightRequestRef.current;
    const frame = id == null ? null : (measureByIdRef.current.get(id)?.() ?? null);
    // A view no longer on screen measures as an empty rectangle at the origin.
    if (!frame || frame.width <= 0 || frame.height <= 0) {
      setHighlight(null);
      return false;
    }

    // Frames are in window coordinates; the outline is positioned inside
    // this component's container, which may not start at the window origin.
    const container = containerRef.current;
    const origin = container
      ? await Promise.race([
          new Promise<{ x: number; y: number }>((resolve) =>
            container.measureInWindow((x, y) => resolve({ x, y })),
          ),
          unmountedRef.current,
        ])
      : { x: 0, y: 0 };

    // A newer request or the unmount has taken over in the meantime.
    if (!origin || request !== highlightRequestRef.current) {
      return false;
    }
    setHighlight({ ...frame, x: frame.x - origin.x, y: frame.y - origin.y });
    return true;
  }, []);

  useAccessibilityAgentTools({
    runAudit: audit,
    getLatestAudit: () => latestAuditRef.current,
    highlight: highlightElement,
  });

  useEffect(() => {
    if (!client) {
      return;
    }

    const rpc = createRozeniteRpc<AccessibilityMethods>(client);
    const subscriptions = [
      rpc.handle('runAudit', audit),
      rpc.handle('highlight', async ({ id }) => {
        await highlightElement(id);
      }),
    ];
    client.send(DEVICE_READY_EVENT, {});

    return () => {
      highlightRequestRef.current++;
      subscriptions.forEach((subscription) => subscription.remove());
      rpc.close();
      setHighlight(null);
    };
  }, [client, audit, highlightElement]);

  return (
    <View
      ref={containerRef}
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      collapsable={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {highlight && (
        <View
          style={[
            styles.highlight,
            {
              left: highlight.x,
              top: highlight.y,
              width: highlight.width,
              height: highlight.height,
            },
          ]}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  highlight: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: HIGHLIGHT_COLOR,
    backgroundColor: `${HIGHLIGHT_COLOR}33`,
  },
});
