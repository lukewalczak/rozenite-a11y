import type {
  AccessibilityElement,
  AccessibilityElementKind,
  AccessibilityIssue,
  Frame,
} from '../shared/types';
import { TEXT_NODE_TYPE, type HostNode } from './host-tree';

export type AuditOptions = {
  platform: string;
};

export type AuditResult = {
  elements: AccessibilityElement[];
  minTouchTarget: number;
  /** Re-measures an element of this audit by id, e.g. to highlight it later. */
  measureById: Map<string, () => Frame | null>;
};

// Apple's Human Interface Guidelines ask for 44pt, Material Design for 48dp.
export const getMinTouchTarget = (platform: string) => (platform === 'android' ? 48 : 44);

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

/** The children a screen reader can reach: the top screen of a native stack, or a modal alone. */
const getVisibleChildren = (node: HostNode): HostNode[] => {
  // A modal view hides its siblings from screen readers.
  const modal = [...node.children]
    .reverse()
    .find(
      (child) =>
        child.props.accessibilityViewIsModal === true || child.props['aria-modal'] === true,
    );
  if (modal) {
    return [modal];
  }
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

// `aria-hidden` works on both platforms; the older props each work on one only.
const isHidden = (node: HostNode, platform: string): boolean => {
  const { props } = node;
  if (
    props['aria-hidden'] === true ||
    (platform === 'ios'
      ? props.accessibilityElementsHidden === true
      : props.importantForAccessibility === 'no-hide-descendants')
  ) {
    return true;
  }
  if (isScreen(node) && props.activityState === 0) {
    return true;
  }
  return flattenStyle(props.style).display === 'none';
};

const getLabel = (node: HostNode): string =>
  asString(node.props.accessibilityLabel) ||
  asString(node.props['aria-label']) ||
  asString(node.props.alt);

const getRole = (node: HostNode): string | null =>
  asString(node.props.role) || asString(node.props.accessibilityRole) || null;

const hasValidRole = (node: HostNode): boolean => {
  const ariaRole = asString(node.props.role);
  return ariaRole
    ? ARIA_ROLES.has(ariaRole)
    : ACCESSIBILITY_ROLES.has(asString(node.props.accessibilityRole));
};

const isInteractive = (node: HostNode, kind: AccessibilityElementKind, role: string | null) =>
  kind === 'input' ||
  kind === 'switch' ||
  typeof node.props.onClick === 'function' ||
  typeof node.props.onPress === 'function' ||
  node.props.isPressable === true ||
  (role != null && INTERACTIVE_ROLES.has(role));

const getStates = (node: HostNode): string[] => {
  const state = asObject(node.props.accessibilityState);
  const read = (key: string) => state[key] ?? node.props[`aria-${key}`];

  const states: string[] = [];
  // A native switch reports its position itself: `value` on iOS, `on` on Android.
  const switchValue = node.props.on ?? node.props.value;
  if (getKind(node.type) === 'switch' && typeof switchValue === 'boolean') {
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
const getRoleIssues = (node: HostNode, kind: AccessibilityElementKind): AccessibilityIssue[] => {
  const issues: AccessibilityIssue[] = [];
  const ariaRole = asString(node.props.role);
  const nativeRole = asString(node.props.accessibilityRole);

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

  const role = ariaRole || nativeRole;
  const state = asObject(node.props.accessibilityState);

  if (kind === 'view' && CHECKABLE_ROLES.has(role)) {
    const checked = state.checked ?? node.props['aria-checked'];
    const selected = state.selected ?? node.props['aria-selected'];
    if (checked === undefined && !(role === 'radio' && selected !== undefined)) {
      issues.push({
        rule: 'missing-state',
        severity: 'warning',
        message: `A ${role} has to say whether it is on. Set aria-checked (or accessibilityState.checked).`,
      });
    }
  }

  if (VALUE_ROLES.has(role) && getValue(node) == null) {
    issues.push({
      rule: 'missing-value',
      severity: 'warning',
      message: `A ${role} has to announce its current value. Set accessibilityValue or aria-valuenow / aria-valuetext.`,
    });
  }

  return issues;
};

const getActions = (node: HostNode): string[] =>
  Array.isArray(node.props.accessibilityActions)
    ? node.props.accessibilityActions
        .map((action) => asString(asObject(action).name))
        .filter(Boolean)
    : [];

const getLiveRegion = (node: HostNode): string | null => {
  const live = asString(node.props['aria-live']) || asString(node.props.accessibilityLiveRegion);
  return live && live !== 'off' && live !== 'none' ? live : null;
};

const blocksTouches = (node: HostNode) => {
  const pointerEvents = node.props.pointerEvents ?? flattenStyle(node.props.style).pointerEvents;
  return pointerEvents === 'none' || pointerEvents === 'box-only';
};

/** Checks of custom actions and of a control that cannot be used but is not announced as such. */
const getBehaviorIssues = (
  node: HostNode,
  role: string | null,
  interactive: boolean,
): AccessibilityIssue[] => {
  const issues: AccessibilityIssue[] = [];
  const actions = getActions(node);
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

  if (role === 'adjustable' && !(actions.includes('increment') && actions.includes('decrement'))) {
    issues.push({
      rule: 'unhandled-actions',
      severity: 'warning',
      message:
        'An adjustable element is changed by swiping up and down, which needs the increment and decrement accessibilityActions.',
    });
  }

  if (interactive && blocksTouches(node) && !getStates(node).includes('disabled')) {
    issues.push({
      rule: 'missing-disabled-state',
      severity: 'warning',
      message:
        'Control ignores touches (pointerEvents) but is not marked disabled, so a screen reader announces it as usable. Set aria-disabled (or accessibilityState.disabled).',
    });
  }

  return issues;
};

/** The text a screen reader assembles for an element that has no label of its own. */
const collectText = (node: HostNode, platform: string): string => {
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
    getVisibleChildren(current).forEach(visit);
  };
  getVisibleChildren(node).forEach(visit);
  return asString(parts.join(' '));
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

// TalkBack's names for the roles it words differently from VoiceOver.
const ANDROID_SPOKEN_ROLES: Record<string, string> = {
  checkbox: 'check box',
  radio: 'radio button',
};

const describe = (
  element: Pick<AccessibilityElement, 'label' | 'role' | 'kind' | 'states' | 'value'>,
  platform: string,
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

const formatSize = (value: number) => String(Math.round(value * 10) / 10);

export const auditHostTree = (roots: HostNode[], { platform }: AuditOptions): AuditResult => {
  const minTouchTarget = getMinTouchTarget(platform);
  const elements: AccessibilityElement[] = [];
  const measureById = new Map<string, () => Frame | null>();

  const addElement = (
    node: HostNode,
    kind: AccessibilityElementKind,
    fields: Pick<AccessibilityElement, 'label' | 'interactive' | 'focusable'>,
    issues: AccessibilityIssue[],
    frame: Frame | null,
  ) => {
    const id = String(elements.length);
    const role = getRole(node);
    const states = getStates(node);
    const value = getValue(node);
    // The component that rendered the element is the one to edit. Without
    // owner information, fall back to the nearest one above it in the tree.
    const component =
      node.ownerPath.find((name) => !isFrameworkComponent(name)) ??
      [...node.componentPath].reverse().find((name) => !isFrameworkComponent(name)) ??
      null;

    measureById.set(id, node.measure);
    elements.push({
      id,
      kind,
      hostType: node.type,
      component,
      componentPath: node.componentPath,
      role,
      hint: asString(node.props.accessibilityHint) || null,
      value,
      states,
      actions: getActions(node),
      liveRegion: getLiveRegion(node),
      // A role React Native ignores is not announced either.
      announcement: describe(
        { label: fields.label, role: hasValidRole(node) ? role : null, kind, states, value },
        platform,
      ),
      frame,
      issues,
      ...fields,
    });
  };

  const checkTouchTarget = (
    node: HostNode,
    kind: AccessibilityElementKind,
    frame: Frame | null,
    issues: AccessibilityIssue[],
  ) => {
    // Links inside a paragraph are exempt from target-size rules (WCAG 2.5.8).
    if (kind === 'text' || !frame || frame.width <= 0 || frame.height <= 0) {
      return;
    }
    const size = getTouchSize(node, frame);
    if (size.width < minTouchTarget || size.height < minTouchTarget) {
      issues.push({
        rule: 'small-touch-target',
        severity: 'warning',
        message: `Touch target is ${formatSize(size.width)}×${formatSize(size.height)}, below the ${minTouchTarget}×${minTouchTarget} minimum. Enlarge it or add hitSlop.`,
      });
    }
  };

  const visit = (node: HostNode, insideAccessible: boolean) => {
    if (node.type === TEXT_NODE_TYPE || isHidden(node, platform)) {
      return;
    }

    const { props } = node;
    const kind = getKind(node.type);
    const role = getRole(node);
    const interactive = isInteractive(node, kind, role);
    const ownLabel = getLabel(node);
    const optedOut = props.accessible === false || props.importantForAccessibility === 'no';
    const fontScalingDisabled = isFontScalingDisabled(node, kind);
    const visitChildren = (inside: boolean) =>
      getVisibleChildren(node).forEach((child) => visit(child, inside));

    if (insideAccessible) {
      // The parent is one accessibility element; its descendants are folded into it.
      // Links inside a paragraph stay reachable through the paragraph itself.
      if (interactive && !optedOut && node.type !== 'RCTVirtualText') {
        addElement(
          node,
          kind,
          // VoiceOver folds it into the parent; TalkBack focuses it as a separate stop.
          {
            label: ownLabel || collectText(node, platform),
            interactive,
            focusable: platform !== 'ios',
          },
          [
            {
              rule: 'nested-interactive',
              severity: platform === 'ios' ? 'error' : 'warning',
              message:
                platform === 'ios'
                  ? 'Control is nested inside another accessible element, so VoiceOver cannot focus it on its own. Set accessible={false} on the parent or move the control out of it.'
                  : 'Control is nested inside another accessible element. TalkBack focuses it separately, without the text around it, and VoiceOver cannot focus it at all. Give it its own label, or move it out of the parent.',
            },
            ...(fontScalingDisabled ? [FONT_SCALING_ISSUE] : []),
          ],
          node.measure(),
        );
      } else if (fontScalingDisabled) {
        addElement(
          node,
          kind,
          { label: collectText(node, platform), interactive, focusable: false },
          [FONT_SCALING_ISSUE],
          node.measure(),
        );
      }
      visitChildren(true);
      return;
    }

    // Android reads plain text even though React Native reports it as not accessible.
    const isNativeStop =
      kind === 'input' || kind === 'switch'
        ? props.accessible !== false
        : kind === 'text' && node.type !== 'RCTVirtualText'
          ? !(platform === 'ios' && props.accessible === false)
          : false;
    const isStop =
      props.importantForAccessibility !== 'no' && (props.accessible === true || isNativeStop);

    if (isStop) {
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
        // An empty Text renders nothing and is skipped by screen readers.
        if (kind === 'text' && !interactive) {
          return;
        }
        issues.push({
          rule: 'missing-label',
          severity: interactive || kind === 'image' ? 'error' : 'warning',
          message: interactive
            ? 'Control has no accessible name. Add an accessibilityLabel or visible text.'
            : 'Element is focusable by screen readers but has nothing to announce. Add an accessibilityLabel or remove accessible.',
        });
      }

      if (interactive && (kind === 'view' || kind === 'text' || kind === 'image') && !role) {
        issues.push({
          rule: 'missing-role',
          severity: 'warning',
          message:
            'Control has no role, so a screen reader does not say that it can be activated. Add role="button" (or link, tab, checkbox…).',
        });
      }

      issues.push(...getRoleIssues(node, kind), ...getBehaviorIssues(node, role, interactive));
      if (fontScalingDisabled) {
        issues.push(FONT_SCALING_ISSUE);
      }

      const frame = node.measure();
      if (interactive) {
        checkTouchTarget(node, kind, frame, issues);
      }

      addElement(node, kind, { label, interactive, focusable: true }, issues, frame);
      visitChildren(true);
      return;
    }

    if (interactive) {
      const frame = node.measure();
      const issues: AccessibilityIssue[] = [
        {
          rule: 'not-accessible',
          severity: 'warning',
          message:
            'Control is hidden from screen readers (accessible={false}). Make sure the same action is reachable another way.',
        },
      ];
      checkTouchTarget(node, kind, frame, issues);
      addElement(
        node,
        kind,
        { label: ownLabel || collectText(node, platform), interactive, focusable: false },
        issues,
        frame,
      );
    } else if (kind === 'image' && props.accessible === undefined && !ownLabel) {
      addElement(
        node,
        kind,
        { label: '', interactive, focusable: false },
        [
          {
            rule: 'image-missing-label',
            severity: 'warning',
            message:
              'Image is invisible to screen readers. Add alt text if it carries meaning, or accessible={false} if it is decorative.',
          },
        ],
        node.measure(),
      );
    }

    visitChildren(false);
  };

  roots.forEach((root) => visit(root, false));

  return { elements, minTouchTarget, measureById };
};
