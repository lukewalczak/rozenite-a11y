import type { AccessibilityElementKind, Platform } from '../shared/types';
import { TEXT_NODE_TYPE, type HostNode } from './host-tree';
import { getKind, getLabel } from './props';
import { flattenStyle, normalizeText } from './values';

const isScreen = (node: HostNode) => /^RNS(Modal|Stack)?Screen$/.test(node.type);

export const isNotDisplayed = (node: HostNode): boolean =>
  (isScreen(node) && node.props.activityState === 0) ||
  flattenStyle(node.props.style).display === 'none';

// On iOS a modal view hides its siblings from VoiceOver. Android has no equivalent.
// Pressable turns `aria-modal` into `accessibilityViewIsModal`; a View passes it on unused.
export const getModalChild = (node: HostNode, platform: Platform): HostNode | undefined =>
  platform === 'ios'
    ? [...node.children]
        .reverse()
        .find((child) => child.props.accessibilityViewIsModal === true && !isNotDisplayed(child))
    : undefined;

/** The children on screen: all of them, except the screens a native stack covers or preloads. */
export const getShownChildren = (node: HostNode): HostNode[] => {
  if (node.type !== 'RNSScreenStack') {
    return node.children;
  }
  // A preloaded screen is mounted after the top one, but is not shown.
  const top = [...node.children]
    .reverse()
    .find((child) => isScreen(child) && child.props.activityState !== 0);
  return node.children.filter((child) => !isScreen(child) || child === top);
};

/** The children a screen reader can reach. */
const getVisibleChildren = (node: HostNode, platform: Platform): HostNode[] => {
  const modal = getModalChild(node, platform);
  return modal ? [modal] : getShownChildren(node);
};

const MODAL_HOST_TYPE = 'RCTModalHostView';

/** The open React Native `<Modal>` drawn on top of everything else, if any. */
export const findTopModalHost = (nodes: HostNode[]): HostNode | undefined => {
  let top: HostNode | undefined;
  const find = (node: HostNode) => {
    if (isNotDisplayed(node)) {
      return;
    }
    if (node.type === MODAL_HOST_TYPE) {
      top = node;
    }
    getShownChildren(node).forEach(find);
  };
  nodes.forEach(find);
  return top;
};

// View turns `aria-hidden` into both of these props, and each works on one platform
// only. Other components pass `aria-hidden` on unused.
export const isHiddenFromScreenReader = (node: HostNode, platform: Platform): boolean =>
  platform === 'ios'
    ? node.props.accessibilityElementsHidden === true
    : node.props.importantForAccessibility === 'no-hide-descendants';

// `importantForAccessibility` is an Android prop; iOS ignores it.
export const isMarkedUnimportant = (node: HostNode, platform: Platform): boolean =>
  platform !== 'ios' && node.props.importantForAccessibility === 'no';

// `focusable` makes the Android view clickable, and TalkBack stops on a clickable view
// even with accessible={false}. Pressable and the Touchables set it by default.
const isAndroidClickable = (node: HostNode, platform: Platform) =>
  platform === 'android' && node.props.focusable === true;

// Android reads plain text even though React Native reports it as not accessible.
export const isScreenReaderStop = (
  node: HostNode,
  kind: AccessibilityElementKind,
  platform: Platform,
): boolean => {
  const { accessible } = node.props;
  const isNativeStop =
    kind === 'input' || kind === 'switch'
      ? accessible !== false
      : kind === 'text' && node.type !== 'RCTVirtualText'
        ? !(platform === 'ios' && accessible === false)
        : false;
  return (
    !isMarkedUnimportant(node, platform) &&
    (accessible === true || isNativeStop || isAndroidClickable(node, platform))
  );
};

// Android makes an accessible view focusable, and TalkBack reads a focusable
// descendant as a stop of its own, not as part of the element around it.
export const isSeparateAndroidStop = (node: HostNode, platform: Platform): boolean => {
  if (platform !== 'android' || isMarkedUnimportant(node, platform)) {
    return false;
  }
  const kind = getKind(node.type);
  return (
    node.props.accessible === true ||
    isAndroidClickable(node, platform) ||
    ((kind === 'input' || kind === 'switch') && node.props.accessible !== false)
  );
};

/** The text a screen reader assembles for an element that has no label of its own. */
export const collectText = (node: HostNode, platform: Platform): string => {
  const parts: string[] = [];
  const visit = (current: HostNode) => {
    if (current.type === TEXT_NODE_TYPE) {
      parts.push(current.text ?? '');
      return;
    }
    if (
      isHiddenFromScreenReader(current, platform) ||
      isNotDisplayed(current) ||
      isSeparateAndroidStop(current, platform)
    ) {
      return;
    }
    const label = getLabel(current);
    if (label) {
      parts.push(label);
      return;
    }
    getVisibleChildren(current, platform).forEach(visit);
  };
  getVisibleChildren(node, platform).forEach(visit);
  return normalizeText(parts.join(' '));
};

export const getAccessibleName = (node: HostNode, platform: Platform): string =>
  getLabel(node) || collectText(node, platform);
