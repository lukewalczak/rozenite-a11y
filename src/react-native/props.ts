import type { AccessibilityElementKind, LiveRegion, Platform } from '../shared/types';
import type { HostNode } from './host-tree';
import { ACCESSIBILITY_ROLES, ADJUSTABLE_ROLES, ARIA_ROLES, INTERACTIVE_ROLES } from './roles';

export const asString = (value: unknown): string =>
  typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';

export const asObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

export const flattenStyle = (style: unknown): Record<string, unknown> => {
  if (Array.isArray(style)) {
    return style.reduce<Record<string, unknown>>(
      (result, entry) => Object.assign(result, flattenStyle(entry)),
      {},
    );
  }
  return asObject(style);
};

const getKind = (type: string): AccessibilityElementKind => {
  if (/TextInput/i.test(type)) return 'input';
  if (/Switch/i.test(type)) return 'switch';
  if (/Image/i.test(type)) return 'image';
  if (/^RCT(Virtual)?Text$/.test(type) || type === 'RCTParagraph') return 'text';
  return 'view';
};

export const getLabel = (node: HostNode): string =>
  asString(node.props.accessibilityLabel) ||
  asString(node.props['aria-label']) ||
  asString(node.props.alt);

export type RoleInfo = {
  ariaRole: string;
  nativeRole: string;
  role: string | null;
  /** A role React Native ignores is not announced either. */
  valid: boolean;
};

const resolveRole = (node: HostNode): RoleInfo => {
  const ariaRole = asString(node.props.role);
  const nativeRole = asString(node.props.accessibilityRole);
  return {
    ariaRole,
    nativeRole,
    role: ariaRole || nativeRole || null,
    valid: ariaRole ? ARIA_ROLES.has(ariaRole) : ACCESSIBILITY_ROLES.has(nativeRole),
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
  asObject(node.props.accessibilityState)[key] ?? node.props[`aria-${key}`];

const getStates = (node: HostNode, kind: AccessibilityElementKind): string[] => {
  const read = (key: string) => readState(node, key);

  const states: string[] = [];
  // A native switch reports its position itself: `value` on iOS, `on` on Android.
  const switchValue = node.props.on ?? node.props.value;
  if (kind === 'switch' && typeof switchValue === 'boolean') {
    states.push(switchValue ? 'on' : 'off');
  }
  if (read('disabled') === true || node.props.disabled === true) states.push('disabled');
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
  const text = asString(value.text) || asString(node.props['aria-valuetext']);
  if (text) {
    return text;
  }
  const now = value.now ?? node.props['aria-valuenow'];
  return typeof now === 'number' ? String(now) : null;
};

const getActions = (node: HostNode): string[] =>
  Array.isArray(node.props.accessibilityActions)
    ? node.props.accessibilityActions
        .map((action) => asString(asObject(action).name))
        .filter(Boolean)
    : [];

/** Everything the audit reads from a host node, read once. */
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

// Native sliders announce their value and handle increment and decrement
// themselves; a plain view does neither.
export const isCustomAdjustable = (node: HostNode, role: string | null) =>
  node.type === 'RCTView' && role != null && ADJUSTABLE_ROLES.has(role);

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

// Components React Native and its common companions put between an app's own
// component and the host element. Skipped when naming the component to fix.
const FRAMEWORK_COMPONENTS = new Set([
  'ActivityIndicator',
  'FlatList',
  'Image',
  'ImageBackground',
  'KeyboardAvoidingView',
  'Pressable',
  'SafeAreaView',
  'ScrollView',
  'SectionList',
  'Switch',
  'Text',
  'TextInput',
  'TouchableHighlight',
  'TouchableNativeFeedback',
  'TouchableOpacity',
  'TouchableWithoutFeedback',
  'View',
  'VirtualizedList',
]);

const FRAMEWORK_COMPONENT_PATTERN =
  /^(Animated|AnimatedComponent|CellRenderer|InternalTextInput|TextAncestor|VirtualizedList|ScrollView|RNS|RNC|RNGestureHandler)|(Context|Provider|Consumer)$/;

const isFrameworkComponent = (name: string) =>
  FRAMEWORK_COMPONENTS.has(name) ||
  FRAMEWORK_COMPONENT_PATTERN.test(name) ||
  /^(Animated|Memo|ForwardRef)\(/.test(name);

// The component that rendered the element is the one to edit. Without owner
// information, fall back to the nearest one above it in the tree.
export const getComponent = (node: HostNode): string | null =>
  node.ownerPath.find((name) => !isFrameworkComponent(name)) ??
  [...node.componentPath].reverse().find((name) => !isFrameworkComponent(name)) ??
  null;
