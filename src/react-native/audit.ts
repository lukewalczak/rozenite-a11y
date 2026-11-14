import type { AccessibilityElement, AccessibilityIssue, Frame, Platform } from '../shared/types';
import { getAnnouncement } from './announcement';
import { getComponent } from './component';
import { TEXT_NODE_TYPE, type HostNode } from './host-tree';
import {
  getLabel,
  getLiveRegion,
  getPointerEvents,
  getValue,
  inspectNode,
  isFontScalingDisabled,
  type InspectedNode,
} from './props';
import type { ReactNativeVersion } from './roles';
import {
  FONT_SCALING_ISSUE,
  IMAGE_MISSING_LABEL_ISSUE,
  IMAGE_NOT_ACCESSIBLE_ISSUE,
  getBehaviorIssues,
  getInvalidRoleIssues,
  getMinTouchTarget,
  getNestedIssue,
  getNotAccessibleIssue,
  getRoleIssues,
  getStopNaming,
  getTouchTargetIssue,
} from './rules';
import { normalizeText } from './values';
import {
  collectText,
  findTopModalHost,
  getAccessibleName,
  getModalChild,
  getShownChildren,
  isHiddenFromScreenReader,
  isMarkedUnimportant,
  isNotDisplayed,
  isScreenReaderStop,
} from './visibility';

type AuditResult = {
  elements: AccessibilityElement[];
  minTouchTarget: number;
  measureById: Map<string, () => Frame | null>;
};

export const auditHostTree = (
  roots: HostNode[],
  platform: Platform,
  reactNativeVersion?: ReactNativeVersion,
): AuditResult => {
  const elements: AccessibilityElement[] = [];
  const measureById = new Map<string, () => Frame | null>();

  /** A control is also checked for its touch target size. */
  const addElement = (
    { node, kind, role, interactive, states, actions }: InspectedNode,
    label: string,
    focusable: boolean,
    issues: AccessibilityIssue[],
  ) => {
    const id = String(elements.length);
    const frame = node.measure();
    const touchTargetIssue = interactive ? getTouchTargetIssue(node, kind, frame, platform) : null;
    const value = getValue(node);

    measureById.set(id, node.measure);
    elements.push({
      id,
      kind,
      hostType: node.type,
      component: getComponent(node),
      componentPath: node.componentPath,
      role: role.declaredRole,
      hint: normalizeText(node.props.accessibilityHint) || null,
      value,
      states,
      actions,
      liveRegion: getLiveRegion(node, platform),
      announcement: getAnnouncement({ label, role: role.role, kind, states, value }, platform),
      frame,
      issues: touchTargetIssue ? [...issues, touchTargetIssue] : issues,
      label,
      interactive,
      focusable,
    });
  };

  const addUnfocusable = (inspected: InspectedNode, issues: AccessibilityIssue[]) =>
    addElement(inspected, collectText(inspected.node, platform), false, issues);

  const modalHost = findTopModalHost(roots);

  // What a screen reader cannot reach is still on screen, so its text still has to
  // scale, and still mounts, so an invalid accessibilityRole still throws on Android.
  // Hidden controls are not listed: navigation libraries hide off-screen pages this way.
  const visitScreenReaderHidden = (node: HostNode) => {
    if (node.type === TEXT_NODE_TYPE || node === modalHost || isNotDisplayed(node)) {
      return;
    }
    const inspected = inspectNode(node);
    const fontScalingIssues = isFontScalingDisabled(node, inspected.kind)
      ? [FONT_SCALING_ISSUE]
      : [];
    const issues = [
      ...getInvalidRoleIssues(inspected.role, reactNativeVersion),
      ...fontScalingIssues,
    ];
    if (issues.length > 0) {
      addUnfocusable({ ...inspected, interactive: false }, issues);
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
    const optedOut = props.accessible === false || isMarkedUnimportant(node, platform);
    const isLiveRegion = getLiveRegion(node, platform) != null;
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

    const getControlIssues = () => [
      ...getRoleIssues(inspected, reactNativeVersion),
      ...getBehaviorIssues(inspected, touchesBlocked),
      ...fontScalingIssues,
    ];
    const addNotAccessible = () =>
      addElement(inspected, getAccessibleName(node, platform), false, [
        getNotAccessibleIssue(node, platform),
        ...getInvalidRoleIssues(inspected.role, reactNativeVersion),
        ...fontScalingIssues,
      ]);
    // An element a screen reader does not stop on is listed for what it gets wrong,
    // or because TalkBack announces changes inside a live region it never stops on.
    const addIfNoteworthy = () => {
      const issues = [
        ...getInvalidRoleIssues(inspected.role, reactNativeVersion),
        ...fontScalingIssues,
      ];
      if (issues.length > 0 || isLiveRegion) {
        addUnfocusable(inspected, issues);
      }
    };

    if (insideAccessible) {
      // The parent is one accessibility element; its descendants are folded into it.
      // Links inside a paragraph stay reachable through the paragraph itself.
      if (!interactive || node.type === 'RCTVirtualText') {
        addIfNoteworthy();
      } else if (platform === 'ios' ? optedOut : !isScreenReaderStop(node, kind, platform)) {
        addNotAccessible();
      } else if (platform === 'ios') {
        // VoiceOver folds the control into the parent.
        addElement(inspected, getAccessibleName(node, platform), false, [
          getNestedIssue(platform),
          ...getControlIssues(),
        ]);
      } else {
        // TalkBack focuses it as a separate stop, which needs a name and a role of its own.
        const stop = getStopNaming(inspected, platform);
        addElement(inspected, stop?.label ?? '', true, [
          getNestedIssue(platform),
          ...(stop?.issues ?? []),
          ...getControlIssues(),
        ]);
      }
      visitChildren(true);
      return;
    }

    // An empty Text is no stop, but what is inside it still counts.
    const stop = isScreenReaderStop(node, kind, platform)
      ? getStopNaming(inspected, platform)
      : null;
    if (stop) {
      addElement(inspected, stop.label, true, [...stop.issues, ...getControlIssues()]);
      visitChildren(true);
      return;
    }

    const ownLabel = getLabel(node);
    if (interactive) {
      addNotAccessible();
    } else if (kind === 'image' && props.accessible === undefined && !ownLabel) {
      addElement(inspected, '', false, [
        IMAGE_MISSING_LABEL_ISSUE,
        ...getInvalidRoleIssues(inspected.role, reactNativeVersion),
      ]);
    } else if (kind === 'image' && props.accessible === undefined && platform === 'ios') {
      addElement(inspected, ownLabel, false, [
        IMAGE_NOT_ACCESSIBLE_ISSUE,
        ...getInvalidRoleIssues(inspected.role, reactNativeVersion),
      ]);
    } else {
      addIfNoteworthy();
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

  return { elements, minTouchTarget: getMinTouchTarget(platform), measureById };
};
