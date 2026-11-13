import type {
  AccessibilityElement,
  AccessibilityElementKind,
  AccessibilityIssue,
  Frame,
  LiveRegion,
  Platform,
} from '../shared/types';
import { formatNumber, roundToTenth } from '../shared/format';
import { TEXT_NODE_TYPE, type HostNode } from './host-tree';

export type AuditResult = {
  elements: AccessibilityElement[];
  minTouchTarget: number;
  measureById: Map<string, () => Frame | null>;
};

// Apple's Human Interface Guidelines ask for 44pt, Material Design for 48dp.
const getMinTouchTarget = (platform: Platform) => (platform === 'android' ? 48 : 44);

const INTERACTIVE_ROLES = new Set([
  'adjustable',
  'button',
  'checkbox',
  'combobox',
  'imagebutton',
  'link',
  'menuitem',
  'radio',
  'searchbox',
  'slider',
  'spinbutton',
  'switch',
  'tab',
  'togglebutton',
]);

// Values of the `accessibilityRole` prop. Anything else is ignored by React Native.
const ACCESSIBILITY_ROLES = new Set(
  (
    'none button dropdownlist togglebutton link search image keyboardkey text adjustable ' +
    'imagebutton header summary alert checkbox combobox menu menubar menuitem progressbar ' +
    'radio radiogroup scrollbar spinbutton switch tab tabbar tablist timer list toolbar grid ' +
    'pager scrollview horizontalscrollview viewgroup webview drawerlayout slidingdrawer iconmenu'
  ).split(' '),
);

// Values of the `role` prop, which follows ARIA.
const ARIA_ROLES = new Set(
  (
    'alert alertdialog application article banner button cell checkbox columnheader combobox ' +
    'complementary contentinfo definition dialog directory document feed figure form grid ' +
    'group heading img link list listitem log main marquee math menu menubar menuitem meter ' +
    'navigation none note option presentation progressbar radio radiogroup region row ' +
    'rowgroup rowheader scrollbar searchbox separator slider spinbutton status summary switch ' +
    'tab table tablist tabpanel term timer toolbar tooltip tree treegrid treeitem'
  ).split(' '),
);

const CHECKABLE_ROLES = new Set(['checkbox', 'radio', 'switch', 'togglebutton']);

const VALUE_ROLES = new Set(['adjustable', 'meter', 'progressbar', 'slider', 'spinbutton']);

const SPOKEN_ROLES: Record<string, string> = {
  adjustable: 'adjustable',
  header: 'heading',
  heading: 'heading',
  imagebutton: 'button',
  img: 'image',
  none: '',
  presentation: '',
  search: 'search field',
  searchbox: 'search field',
  text: '',
  togglebutton: 'toggle button',
};

const SPOKEN_KINDS: Partial<Record<AccessibilityElementKind, string>> = {
  image: 'image',
  input: 'text field',
  switch: 'switch',
};

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

const asString = (value: unknown): string =>
  typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';

const asObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const flattenStyle = (style: unknown): Record<string, unknown> => {
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

const isScreen = (node: HostNode) => /^RNS(Modal|Stack)?Screen$/.test(node.type);

// On iOS a modal view hides its siblings from VoiceOver. Android has no equivalent.
const getModalChild = (node: HostNode, platform: Platform): HostNode | undefined =>
  platform === 'ios'
    ? [...node.children]
        .reverse()
        .find(
          (child) =>
            child.props.accessibilityViewIsModal === true || child.props['aria-modal'] === true,
        )
    : undefined;

/** The children on screen: all of them, except the screens a native stack covers. */
const getShownChildren = (node: HostNode): HostNode[] => {
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

const MODAL_HOST_TYPE = 'RCTModalHostView';

/** The open React Native `<Modal>` drawn on top of everything else, if any. */
const findTopModalHost = (nodes: HostNode[]): HostNode | undefined => {
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

const isNotDisplayed = (node: HostNode): boolean =>
  (isScreen(node) && node.props.activityState === 0) ||
  flattenStyle(node.props.style).display === 'none';

// `aria-hidden` works on both platforms; the older props each work on one only.
const isHiddenFromScreenReader = (node: HostNode, platform: Platform): boolean =>
  node.props['aria-hidden'] === true ||
  (platform === 'ios'
    ? node.props.accessibilityElementsHidden === true
    : node.props.importantForAccessibility === 'no-hide-descendants');

const isHidden = (node: HostNode, platform: Platform): boolean =>
  isHiddenFromScreenReader(node, platform) || isNotDisplayed(node);

const getLabel = (node: HostNode): string =>
  asString(node.props.accessibilityLabel) ||
  asString(node.props['aria-label']) ||
  asString(node.props.alt);

type RoleInfo = {
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

const readState = (node: HostNode, key: string): unknown =>
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

const getValue = (node: HostNode): string | null => {
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
type InspectedNode = {
  node: HostNode;
  kind: AccessibilityElementKind;
  role: RoleInfo;
  interactive: boolean;
  states: string[];
  actions: string[];
};

const inspectNode = (node: HostNode): InspectedNode => {
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

const ADJUSTABLE_ROLES = new Set(['adjustable', 'slider']);

// Native sliders announce their value and handle increment and decrement
// themselves; a plain view does neither.
const isCustomAdjustable = (node: HostNode, role: string | null) =>
  node.type === 'RCTView' && role != null && ADJUSTABLE_ROLES.has(role);

const isFontScalingDisabled = (node: HostNode, kind: AccessibilityElementKind) =>
  (kind === 'text' || kind === 'input') &&
  (node.props.allowFontScaling === false || node.props.maxFontSizeMultiplier === 1);

const FONT_SCALING_ISSUE: AccessibilityIssue = {
  rule: 'font-scaling-disabled',
  severity: 'warning',
  message:
    'Text ignores the font size the user chose in system settings. Remove allowFontScaling={false}, or cap growth with a maxFontSizeMultiplier above 1 instead.',
};

/** Checks of the role itself and of the state and value that role is expected to carry. */
const getRoleIssues = ({ node, kind, role: roleInfo }: InspectedNode): AccessibilityIssue[] => {
  const issues: AccessibilityIssue[] = [];
  const { ariaRole, nativeRole } = roleInfo;

  if (ariaRole && !ARIA_ROLES.has(ariaRole)) {
    issues.push({
      rule: 'invalid-role',
      severity: 'warning',
      message: `"${ariaRole}" is not a role React Native knows, so it is ignored.`,
    });
  } else if (!ariaRole && nativeRole && !ACCESSIBILITY_ROLES.has(nativeRole)) {
    issues.push({
      rule: 'invalid-role',
      // Not just unannounced: Android rejects the value and the view fails to mount.
      severity: 'error',
      message: ARIA_ROLES.has(nativeRole)
        ? `"${nativeRole}" is a value of the role prop, not of accessibilityRole. iOS ignores it and Android throws. Use role="${nativeRole}".`
        : `"${nativeRole}" is not an accessibilityRole React Native knows. iOS ignores it and Android throws.`,
    });
  }

  const role = roleInfo.role ?? '';

  if (kind === 'view' && CHECKABLE_ROLES.has(role)) {
    const checked = readState(node, 'checked');
    const selected = readState(node, 'selected');
    if (checked === undefined && !(role === 'radio' && selected !== undefined)) {
      issues.push({
        rule: 'missing-state',
        severity: 'warning',
        message: `A ${role} has to say whether it is on. Set aria-checked (or accessibilityState.checked).`,
      });
    }
  }

  const announcesOwnValue = ADJUSTABLE_ROLES.has(role) && !isCustomAdjustable(node, role);
  if (VALUE_ROLES.has(role) && !announcesOwnValue && getValue(node) == null) {
    issues.push({
      rule: 'missing-value',
      severity: 'warning',
      message: `A ${role} has to announce its current value. Set accessibilityValue or aria-valuenow / aria-valuetext.`,
    });
  }

  return issues;
};

// Live regions are an Android feature; VoiceOver does not announce them. View and
// Pressable turn `aria-live` into `accessibilityLiveRegion`; Text passes it on unused.
const getLiveRegion = (node: HostNode, platform: Platform): LiveRegion | null => {
  if (platform !== 'android') {
    return null;
  }
  const live = node.props.accessibilityLiveRegion;
  return live === 'polite' || live === 'assertive' ? live : null;
};

const getPointerEvents = (node: HostNode) =>
  node.props.pointerEvents ?? flattenStyle(node.props.style).pointerEvents;

/** Checks of custom actions and of a control that cannot be used but is not announced as such. */
const getBehaviorIssues = (
  { node, role, interactive, states, actions }: InspectedNode,
  touchesBlocked: boolean,
): AccessibilityIssue[] => {
  const issues: AccessibilityIssue[] = [];
  const hasHandler = typeof node.props.onAccessibilityAction === 'function';

  if (actions.length > 0 && !hasHandler) {
    issues.push({
      rule: 'unhandled-actions',
      severity: 'error',
      message: `Declares accessibilityActions (${actions.join(', ')}) but has no onAccessibilityAction, so choosing one does nothing.`,
    });
  } else if (actions.length === 0 && hasHandler) {
    issues.push({
      rule: 'unhandled-actions',
      severity: 'warning',
      message:
        'Has onAccessibilityAction but declares no accessibilityActions, so a screen reader offers nothing to call it with.',
    });
  }

  if (
    isCustomAdjustable(node, role.role) &&
    !(actions.includes('increment') && actions.includes('decrement'))
  ) {
    issues.push({
      rule: 'unhandled-actions',
      severity: 'warning',
      message:
        'An adjustable element is changed by swiping up and down, which needs the increment and decrement accessibilityActions.',
    });
  }

  if (interactive && touchesBlocked && !states.includes('disabled')) {
    issues.push({
      rule: 'missing-disabled-state',
      severity: 'warning',
      message:
        'Control ignores touches (pointerEvents) but is not marked disabled, so a screen reader announces it as usable. Set aria-disabled (or accessibilityState.disabled).',
    });
  }

  return issues;
};

const getNestedIssue = (platform: Platform): AccessibilityIssue => ({
  rule: 'nested-interactive',
  severity: platform === 'ios' ? 'error' : 'warning',
  message:
    platform === 'ios'
      ? 'Control is nested inside another accessible element, so VoiceOver cannot focus it on its own. Set accessible={false} on the parent or move the control out of it.'
      : 'Control is nested inside another accessible element. TalkBack focuses it separately, without the text around it, and VoiceOver cannot focus it at all. Give it its own label, or move it out of the parent.',
});

const getNotAccessibleIssue = (node: HostNode): AccessibilityIssue => {
  const reason =
    node.props.importantForAccessibility === 'no'
      ? 'importantForAccessibility="no"'
      : node.props.accessible === false
        ? 'accessible={false}'
        : 'accessible={true} is missing';
  return {
    rule: 'not-accessible',
    severity: 'warning',
    message: `Control is hidden from screen readers (${reason}). Make sure the same action is reachable another way.`,
  };
};

const IMAGE_MISSING_LABEL_ISSUE: AccessibilityIssue = {
  rule: 'image-missing-label',
  severity: 'warning',
  message:
    'Image is invisible to screen readers. Add alt text if it carries meaning, or accessible={false} if it is decorative.',
};

/** The text a screen reader assembles for an element that has no label of its own. */
const collectText = (node: HostNode, platform: Platform): string => {
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

// Android reads plain text even though React Native reports it as not accessible.
const isScreenReaderStop = (
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

/**
 * The label and naming issues of a screen reader stop. `null` for an empty Text,
 * which renders nothing and is skipped by screen readers.
 */
const getStopLabel = (
  { node, kind, interactive, role }: InspectedNode,
  ownLabel: string,
  platform: Platform,
): { label: string; issues: AccessibilityIssue[] } | null => {
  const { props } = node;
  const content = ownLabel || collectText(node, platform);
  const issues: AccessibilityIssue[] = [];
  let label = content;

  if (kind === 'input') {
    const placeholder = asString(props.placeholder);
    const labelledBy = props.accessibilityLabelledBy ?? props['aria-labelledby'];
    label = ownLabel || placeholder;
    if (!ownLabel && !labelledBy) {
      issues.push({
        rule: 'input-missing-label',
        severity: placeholder ? 'warning' : 'error',
        message: placeholder
          ? 'Text input is only described by its placeholder, which disappears once the user types. Add an accessibilityLabel.'
          : 'Text input has no accessibilityLabel, so a screen reader cannot say what it is for.',
      });
    }
  } else if (!content) {
    if (kind === 'text' && !interactive) {
      return null;
    }
    issues.push({
      rule: 'missing-label',
      severity: interactive || kind === 'image' ? 'error' : 'warning',
      message: interactive
        ? 'Control has no accessible name. Add an accessibilityLabel or visible text.'
        : 'Element is focusable by screen readers but has nothing to announce. Add an accessibilityLabel or remove accessible.',
    });
  }

  if (interactive && (kind === 'view' || kind === 'text' || kind === 'image') && !role.role) {
    issues.push({
      rule: 'missing-role',
      severity: 'warning',
      message:
        'Control has no role, so a screen reader does not say that it can be activated. Add role="button" (or link, tab, checkbox…).',
    });
  }

  return { label, issues };
};

const getTouchSize = (node: HostNode, frame: Frame) => {
  const hitSlop = node.props.hitSlop;
  const slop = asObject(hitSlop);
  const edge = (key: string) => {
    if (typeof hitSlop === 'number') return hitSlop;
    return typeof slop[key] === 'number' ? (slop[key] as number) : 0;
  };
  return {
    width: frame.width + edge('left') + edge('right'),
    height: frame.height + edge('top') + edge('bottom'),
  };
};

const getTouchTargetIssue = (
  node: HostNode,
  frame: Frame | null,
  minTouchTarget: number,
): AccessibilityIssue | null => {
  // Links inside a paragraph are exempt from target-size rules (WCAG 2.5.8).
  if (node.type === 'RCTVirtualText' || !frame || frame.width <= 0 || frame.height <= 0) {
    return null;
  }
  const size = getTouchSize(node, frame);
  // Layout snaps to physical pixels, so a 48dp view can measure 47.9999.
  const isBelowMinimum = (value: number) => roundToTenth(value) < minTouchTarget;
  if (!isBelowMinimum(size.width) && !isBelowMinimum(size.height)) {
    return null;
  }
  return {
    rule: 'small-touch-target',
    severity: 'warning',
    message: `Touch target is ${formatNumber(size.width)}×${formatNumber(size.height)}, below the ${minTouchTarget}×${minTouchTarget} minimum. Enlarge it or add hitSlop.`,
  };
};

// TalkBack's names for the roles it words differently from VoiceOver.
const ANDROID_SPOKEN_ROLES: Record<string, string> = {
  checkbox: 'check box',
  radio: 'radio button',
};

const describe = (
  element: Pick<AccessibilityElement, 'label' | 'role' | 'kind' | 'states' | 'value'>,
  platform: Platform,
) => {
  const isAndroid = platform === 'android';
  let role = element.role
    ? (SPOKEN_ROLES[element.role] ?? element.role)
    : (SPOKEN_KINDS[element.kind] ?? '');
  if (isAndroid) {
    role = element.kind === 'input' ? 'edit box' : (ANDROID_SPOKEN_ROLES[role] ?? role);
  }
  // TalkBack leads with state and value by default; VoiceOver ends with them.
  const parts = isAndroid
    ? [...element.states, element.value, element.label, role]
    : [element.label, element.value, role, ...element.states];
  return parts.filter(Boolean).join(', ');
};

// The component that rendered the element is the one to edit. Without owner
// information, fall back to the nearest one above it in the tree.
const getComponent = (node: HostNode): string | null =>
  node.ownerPath.find((name) => !isFrameworkComponent(name)) ??
  [...node.componentPath].reverse().find((name) => !isFrameworkComponent(name)) ??
  null;

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
      announcement: describe(
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
