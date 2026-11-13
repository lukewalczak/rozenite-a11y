import type { AccessibilityElementKind, Platform } from '../shared/types';
import { TEXT_NODE_TYPE, type HostNode } from './host-tree';
import { asString, flattenStyle, getLabel } from './props';

const isScreen = (node: HostNode) => /^RNS(Modal|Stack)?Screen$/.test(node.type);

// On iOS a modal view hides its siblings from VoiceOver. Android has no equivalent.
export const getModalChild = (node: HostNode, platform: Platform): HostNode | undefined =>
  platform === 'ios'
    ? [...node.children]
        .reverse()
        .find(
          (child) =>
            child.props.accessibilityViewIsModal === true || child.props['aria-modal'] === true,
        )
    : undefined;

/** The children on screen: all of them, except the screens a native stack covers. */
export const getShownChildren = (node: HostNode): HostNode[] => {
  if (node.type !== 'RNSScreenStack') {
    return node.children;
  }
  const screens = node.children.filter(isScreen);
  if (screens.length < 2) {
    return node.children;
  }
  const top = screens[screens.length - 1];
  return node.children.filter((child) => !isScreen(child) || child === top);
};

/** The children a screen reader can reach. */
const getVisibleChildren = (node: HostNode, platform: Platform): HostNode[] => {
  const modal = getModalChild(node, platform);
  return modal ? [modal] : getShownChildren(node);
};

export const isNotDisplayed = (node: HostNode): boolean =>
  (isScreen(node) && node.props.activityState === 0) ||
  flattenStyle(node.props.style).display === 'none';

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

// `aria-hidden` works on both platforms; the older props each work on one only.
export const isHiddenFromScreenReader = (node: HostNode, platform: Platform): boolean =>
  node.props['aria-hidden'] === true ||
  (platform === 'ios'
    ? node.props.accessibilityElementsHidden === true
    : node.props.importantForAccessibility === 'no-hide-descendants');

const isHidden = (node: HostNode, platform: Platform): boolean =>
  isHiddenFromScreenReader(node, platform) || isNotDisplayed(node);

// Android reads plain text even though React Native reports it as not accessible.
export const isScreenReaderStop = (
  node: HostNode,
  kind: AccessibilityElementKind,
  platform: Platform,
): boolean => {
  const { accessible, importantForAccessibility } = node.props;
  const isNativeStop =
    kind === 'input' || kind === 'switch'
      ? accessible !== false
      : kind === 'text' && node.type !== 'RCTVirtualText'
        ? !(platform === 'ios' && accessible === false)
        : false;
  return importantForAccessibility !== 'no' && (accessible === true || isNativeStop);
};

/** The text a screen reader assembles for an element that has no label of its own. */
export const collectText = (node: HostNode, platform: Platform): string => {
  const parts: string[] = [];
  const visit = (current: HostNode) => {
    if (current.type === TEXT_NODE_TYPE) {
      parts.push(current.text ?? '');
      return;
    }
    if (isHidden(current, platform)) {
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
  return asString(parts.join(' '));
};
