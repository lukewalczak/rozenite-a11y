import type { AccessibilityElement, AccessibilityIssue, Frame, Platform } from '../shared/types';
import { getAnnouncement } from './announcement';
import { TEXT_NODE_TYPE, type HostNode } from './host-tree';
import {
  asString,
  getComponent,
  getLabel,
  getLiveRegion,
  getPointerEvents,
  getValue,
  inspectNode,
  isFontScalingDisabled,
  type InspectedNode,
} from './props';
import {
  FONT_SCALING_ISSUE,
  IMAGE_MISSING_LABEL_ISSUE,
  getBehaviorIssues,
  getMinTouchTarget,
  getNestedIssue,
  getNotAccessibleIssue,
  getRoleIssues,
  getStopLabel,
  getTouchTargetIssue,
} from './rules';
import {
  collectText,
  findTopModalHost,
  getModalChild,
  getShownChildren,
  isHiddenFromScreenReader,
  isNotDisplayed,
  isScreenReaderStop,
} from './visibility';

export type AuditResult = {
  elements: AccessibilityElement[];
  minTouchTarget: number;
  measureById: Map<string, () => Frame | null>;
};

export const auditHostTree = (roots: HostNode[], platform: Platform): AuditResult => {
  const minTouchTarget = getMinTouchTarget(platform);
  const elements: AccessibilityElement[] = [];
  const measureById = new Map<string, () => Frame | null>();

  /** Lists an element; a control is also checked for its touch target size. */
  const addElement = (
    { node, kind, role, interactive, states, actions }: InspectedNode,
    label: string,
    focusable: boolean,
    issues: AccessibilityIssue[],
  ) => {
    const id = String(elements.length);
    const frame = node.measure();
    const touchTargetIssue = interactive ? getTouchTargetIssue(node, frame, minTouchTarget) : null;
    const value = getValue(node);

    measureById.set(id, node.measure);
    elements.push({
      id,
      kind,
      hostType: node.type,
      component: getComponent(node),
      componentPath: node.componentPath,
      role: role.role,
      hint: asString(node.props.accessibilityHint) || null,
      value,
      states,
      actions,
      liveRegion: getLiveRegion(node, platform),
      announcement: getAnnouncement(
        { label, role: role.valid ? role.role : null, kind, states, value },
        platform,
      ),
      frame,
      issues: touchTargetIssue ? [...issues, touchTargetIssue] : issues,
      label,
      interactive,
      focusable,
    });
  };

  /** Lists an element a screen reader does not stop on, named after its text. */
  const addUnfocusable = (inspected: InspectedNode, issues: AccessibilityIssue[]) =>
    addElement(inspected, collectText(inspected.node, platform), false, issues);

  const modalHost = findTopModalHost(roots);

  // Text hidden from screen readers is still on screen, so it still has to scale.
  const visitScreenReaderHidden = (node: HostNode) => {
    if (node.type === TEXT_NODE_TYPE || node === modalHost || isNotDisplayed(node)) {
      return;
    }
    const inspected = inspectNode(node);
    if (isFontScalingDisabled(node, inspected.kind)) {
      addUnfocusable({ ...inspected, interactive: false }, [FONT_SCALING_ISSUE]);
    }
    getShownChildren(node).forEach(visitScreenReaderHidden);
  };

  const visit = (node: HostNode, insideAccessible: boolean, ancestorBlocksTouches: boolean) => {
    if (node.type === TEXT_NODE_TYPE || isNotDisplayed(node)) {
      return;
    }
    if (isHiddenFromScreenReader(node, platform)) {
      visitScreenReaderHidden(node);
      return;
    }

    const { props } = node;
    const inspected = inspectNode(node);
    const { kind, interactive } = inspected;
    const ownLabel = getLabel(node);
    const optedOut = props.accessible === false || props.importantForAccessibility === 'no';
    const fontScalingIssues = isFontScalingDisabled(node, kind) ? [FONT_SCALING_ISSUE] : [];
    // `box-only` stops touches on the descendants. `box-none` does not block the
    // control itself: a touch on its children still reaches its press handlers.
    const pointerEvents = getPointerEvents(node);
    const touchesBlocked = ancestorBlocksTouches || pointerEvents === 'none';
    const childrenBlockTouches = touchesBlocked || pointerEvents === 'box-only';
    const modal = getModalChild(node, platform);
    const visitChildren = (inside: boolean) =>
      getShownChildren(node).forEach((child) =>
        modal && child !== modal
          ? visitScreenReaderHidden(child)
          : visit(child, inside, childrenBlockTouches),
      );

    if (insideAccessible) {
      // The parent is one accessibility element; its descendants are folded into it.
      // Links inside a paragraph stay reachable through the paragraph itself.
      if (interactive && !optedOut && node.type !== 'RCTVirtualText') {
        // VoiceOver folds it into the parent; TalkBack focuses it as a separate stop.
        addElement(inspected, ownLabel || collectText(node, platform), platform !== 'ios', [
          getNestedIssue(platform),
          ...getRoleIssues(inspected),
          ...getBehaviorIssues(inspected, touchesBlocked),
          ...fontScalingIssues,
        ]);
      } else if (fontScalingIssues.length > 0) {
        addUnfocusable(inspected, fontScalingIssues);
      }
      visitChildren(true);
      return;
    }

    if (isScreenReaderStop(node, kind, platform)) {
      const stop = getStopLabel(inspected, ownLabel, platform);
      if (!stop) {
        return;
      }
      addElement(inspected, stop.label, true, [
        ...stop.issues,
        ...getRoleIssues(inspected),
        ...getBehaviorIssues(inspected, touchesBlocked),
        ...fontScalingIssues,
      ]);
      visitChildren(true);
      return;
    }

    if (interactive) {
      addElement(inspected, ownLabel || collectText(node, platform), false, [
        getNotAccessibleIssue(node),
        ...fontScalingIssues,
      ]);
    } else if (kind === 'image' && props.accessible === undefined && !ownLabel) {
      addElement(inspected, '', false, [IMAGE_MISSING_LABEL_ISSUE]);
    } else if (fontScalingIssues.length > 0 || getLiveRegion(node, platform)) {
      // TalkBack announces changes inside a live region it never stops on.
      addUnfocusable(inspected, fontScalingIssues);
    }

    visitChildren(false);
  };

  if (modalHost) {
    // A screen reader stays inside an open modal. What is behind it is only on
    // screen when the modal is transparent.
    visit(modalHost, false, false);
    if (modalHost.props.transparent === true) {
      roots.forEach(visitScreenReaderHidden);
    }
  } else {
    roots.forEach((root) => visit(root, false, false));
  }

  return { elements, minTouchTarget, measureById };
};
