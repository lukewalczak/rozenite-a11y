import { createRozeniteRpc, useRozeniteDevToolsClient } from '@rozenite/plugin-bridge';
import { useEffect, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { AccessibilityInfo, PixelRatio, Platform, StyleSheet, View } from 'react-native';
import {
  ACCESSIBILITY_PLUGIN_ID,
  type AccessibilityEventMap,
  type AccessibilityMethods,
} from '../shared/messaging';
import type { AccessibilityAudit, AccessibilitySystemState, Frame } from '../shared/types';
import { auditHostTree } from './audit';
import { collectHostNodes } from './host-tree';
import { getFiberRoots, measureHostInstance } from './runtime';

const HIGHLIGHT_COLOR = '#ff4f7b';

// Some of these settings exist on one platform only, and a query for a
// missing one must not fail the whole audit.
const query = (read: (() => Promise<boolean>) | undefined): Promise<boolean> => {
  try {
    return read ? read().catch(() => false) : Promise.resolve(false);
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
    query(AccessibilityInfo.isScreenReaderEnabled),
    query(AccessibilityInfo.isReduceMotionEnabled),
    query(AccessibilityInfo.isBoldTextEnabled),
    query(AccessibilityInfo.isGrayscaleEnabled),
    query(AccessibilityInfo.isInvertColorsEnabled),
    query(AccessibilityInfo.isReduceTransparencyEnabled),
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

/**
 * Connects the app to the Accessibility panel and draws the outline of the
 * element selected there. Render it once, after the rest of the app, so the
 * outline ends up on top.
 */
export const RozeniteAccessibility = (): ReactNode => {
  const client = useRozeniteDevToolsClient<AccessibilityEventMap>({
    pluginId: ACCESSIBILITY_PLUGIN_ID,
  });
  const [highlight, setHighlight] = useState<Frame | null>(null);
  const containerRef = useRef<ComponentRef<typeof View>>(null);
  const measureByIdRef = useRef(new Map<string, () => Frame | null>());
  const highlightRequestRef = useRef(0);

  useEffect(() => {
    if (!client) {
      return;
    }

    const rpc = createRozeniteRpc<AccessibilityMethods>(client);

    const subscriptions = [
      rpc.handle('runAudit', async (): Promise<AccessibilityAudit> => {
        const roots = getFiberRoots();
        if (!roots) {
          throw new Error(
            'The React DevTools hook is not available, so the component tree cannot be read.',
          );
        }

        const { elements, minTouchTarget, measureById } = auditHostTree(
          collectHostNodes(roots, measureHostInstance),
          { platform: Platform.OS },
        );
        measureByIdRef.current = measureById;

        return {
          platform: Platform.OS,
          minTouchTarget,
          elements,
          system: await getSystemState(),
          takenAt: Date.now(),
        };
      }),
      rpc.handle('highlight', async ({ id }) => {
        const request = ++highlightRequestRef.current;
        const frame = id == null ? null : (measureByIdRef.current.get(id)?.() ?? null);
        if (!frame) {
          setHighlight(null);
          return { highlighted: false };
        }

        // Frames are in window coordinates; the outline is positioned inside
        // this component's container, which may not start at the window origin.
        const container = containerRef.current;
        const origin = container
          ? await new Promise<{ x: number; y: number }>((resolve) =>
              container.measureInWindow((x, y) => resolve({ x: x || 0, y: y || 0 })),
            )
          : { x: 0, y: 0 };

        // A newer request or the cleanup below has taken over in the meantime.
        if (request !== highlightRequestRef.current) {
          return { highlighted: false };
        }
        setHighlight({ ...frame, x: frame.x - origin.x, y: frame.y - origin.y });
        return { highlighted: true };
      }),
    ];

    return () => {
      highlightRequestRef.current++;
      subscriptions.forEach((subscription) => subscription.remove());
      rpc.close();
      setHighlight(null);
    };
  }, [client]);

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
