import type { AccessibilityElementKind, LiveRegion, Platform } from '../shared/types';
import type { HostNode } from './host-tree';
import { ACCESSIBILITY_ROLES, ARIA_ROLES, INTERACTIVE_ROLES } from './roles';
import { asObject, flattenStyle, isUnknownArray, normalizeText } from './values';

export const getKind = (type: string): AccessibilityElementKind => {
  if (/TextInput/i.test(type)) return 'input';
  if (/Switch/i.test(type)) return 'switch';
  if (/Image/i.test(type)) return 'image';
  if (/^RCT(Virtual)?Text$/.test(type) || type === 'RCTParagraph') return 'text';
  return 'view';
};

// React Native's components turn `aria-*` and `alt` into the accessibility props read
// here and below. A raw one that reaches a host was not converted, and native ignores it.
export const getLabel = (node: HostNode): string => normalizeText(node.props.accessibilityLabel);

export type RoleInfo = {
  ariaRole: string;
  nativeRole: string;
  /** The role the platform applies: a valid `role`, else a valid `accessibilityRole`. */
  role: string | null;
  /** The role as written, even when React Native ignores it. */
  declaredRole: string | null;
};

const resolveRole = (node: HostNode): RoleInfo => {
  const ariaRole = normalizeText(node.props.role);
  const nativeRole = normalizeText(node.props.accessibilityRole);
  return {
    ariaRole,
    nativeRole,
    role: ARIA_ROLES.has(ariaRole)
      ? ariaRole
      : ACCESSIBILITY_ROLES.has(nativeRole)
        ? nativeRole
        : null,
    declaredRole: ariaRole || nativeRole || null,
  };
};

const isInteractive = (node: HostNode, kind: AccessibilityElementKind, role: string | null) =>
  kind === 'input' ||
  kind === 'switch' ||
  typeof node.props.onClick === 'function' ||
  typeof node.props.onPress === 'function' ||
  node.props.isPressable === true ||
  (role != null && INTERACTIVE_ROLES.has(role));

export const readState = (node: HostNode, key: string): unknown =>
  asObject(node.props.accessibilityState)[key];

const getStates = (node: HostNode, kind: AccessibilityElementKind): string[] => {
  const read = (key: string) => readState(node, key);

  const states: string[] = [];
  // A native switch reports its position itself: `value` on iOS, `on` on Android.
  const switchValue = node.props.on ?? node.props.value;
  if (kind === 'switch' && typeof switchValue === 'boolean') {
    states.push(switchValue ? 'on' : 'off');
  }
  // The iOS switch takes `disabled` as a prop of its own; a View ignores it.
  const disabledProp = kind === 'switch' && node.props.disabled === true;
  if (read('disabled') === true || disabledProp) states.push('disabled');
  if (read('selected') === true) states.push('selected');
  const checked = read('checked');
  if (checked === true) states.push('checked');
  if (checked === false) states.push('not checked');
  if (checked === 'mixed') states.push('mixed');
  if (read('busy') === true) states.push('busy');
  const expanded = read('expanded');
  if (expanded === true) states.push('expanded');
  if (expanded === false) states.push('collapsed');
  return states;
};

export const getValue = (node: HostNode): string | null => {
  const value = asObject(node.props.accessibilityValue);
  const text = normalizeText(value.text);
  if (text) {
    return text;
  }
  const read = (key: 'now' | 'min' | 'max') => {
    const number = value[key];
    return typeof number === 'number' ? number : null;
  };
  const now = read('now');
  const min = read('min');
  const max = read('max');
  // Both platforms announce a number only together with its range, as a percentage.
  if (now == null || min == null || max == null || max <= min) {
    return null;
  }
  return `${Math.round(((now - min) / (max - min)) * 100)}%`;
};

const getActions = (node: HostNode): string[] => {
  const actions = node.props.accessibilityActions;
  return isUnknownArray(actions)
    ? actions.map((action) => normalizeText(asObject(action).name)).filter(Boolean)
    : [];
};

export type InspectedNode = {
  node: HostNode;
  kind: AccessibilityElementKind;
  role: RoleInfo;
  interactive: boolean;
  states: string[];
  actions: string[];
};

export const inspectNode = (node: HostNode): InspectedNode => {
  const kind = getKind(node.type);
  const role = resolveRole(node);
  return {
    node,
    kind,
    role,
    interactive: isInteractive(node, kind, role.role),
    states: getStates(node, kind),
    actions: getActions(node),
  };
};

export const isFontScalingDisabled = (node: HostNode, kind: AccessibilityElementKind) =>
  (kind === 'text' || kind === 'input') &&
  (node.props.allowFontScaling === false || node.props.maxFontSizeMultiplier === 1);

// Live regions are an Android feature; VoiceOver does not announce them. View and
// Pressable turn `aria-live` into `accessibilityLiveRegion`; Text passes it on unused.
export const getLiveRegion = (node: HostNode, platform: Platform): LiveRegion | null => {
  if (platform !== 'android') {
    return null;
  }
  const live = node.props.accessibilityLiveRegion;
  return live === 'polite' || live === 'assertive' ? live : null;
};

export const getPointerEvents = (node: HostNode) =>
  node.props.pointerEvents ?? flattenStyle(node.props.style).pointerEvents;
