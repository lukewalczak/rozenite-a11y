import type {
  AccessibilityElementKind,
  AccessibilityIssue,
  Frame,
  Platform,
} from '../shared/types';
import { formatNumber, roundToTenth } from '../shared/format';
import type { HostNode } from './host-tree';
import { getLabel, getValue, readState, type InspectedNode, type RoleInfo } from './props';
import {
  ACCESSIBILITY_ROLES,
  ADJUSTABLE_ROLES,
  ARIA_ROLES,
  CHECKABLE_ROLES,
  INTERACTIVE_ROLES,
  IOS_ONLY_ACCESSIBILITY_ROLES,
  VALUE_ROLES,
  isTabBarRejectedOnAndroid,
  type ReactNativeVersion,
} from './roles';
import { asObject, isUnknownArray, normalizeText } from './values';
import { getAccessibleName, isMarkedUnimportant } from './visibility';

// Apple's Human Interface Guidelines ask for 44pt, Material Design for 48dp.
export const getMinTouchTarget = (platform: Platform) => (platform === 'android' ? 48 : 44);

export const FONT_SCALING_ISSUE: AccessibilityIssue = {
  rule: 'font-scaling-disabled',
  severity: 'warning',
  message:
    'Text ignores the font size the user chose in system settings. Remove allowFontScaling={false}, or cap growth with a maxFontSizeMultiplier above 1 instead.',
};

export const IMAGE_MISSING_LABEL_ISSUE: AccessibilityIssue = {
  rule: 'image-missing-label',
  severity: 'warning',
  message:
    'Image is invisible to screen readers. Add alt text if it carries meaning, or accessible={false} if it is decorative.',
};

const FOCUSABLE_IMAGE_MISSING_LABEL_ISSUE: AccessibilityIssue = {
  rule: 'image-missing-label',
  severity: 'error',
  message:
    'Image is focusable by screen readers but has no label. Add alt text, or accessible={false} if it is decorative.',
};

export const IMAGE_NOT_ACCESSIBLE_ISSUE: AccessibilityIssue = {
  rule: 'not-accessible',
  severity: 'warning',
  message:
    'Image has a label but is not accessible, so VoiceOver skips it. Use alt instead of accessibilityLabel, or add accessible.',
};

const MISSING_DISABLED_STATE_ISSUE: AccessibilityIssue = {
  rule: 'missing-disabled-state',
  severity: 'warning',
  message:
    'Control ignores touches (pointerEvents) but is not marked disabled, so a screen reader announces it as usable. Set aria-disabled (or accessibilityState.disabled).',
};

const ACTIONS_WITHOUT_DECLARATION_ISSUE: AccessibilityIssue = {
  rule: 'unused-action-handler',
  severity: 'warning',
  message:
    'Has onAccessibilityAction but declares no accessibilityActions, so a screen reader offers nothing to call it with.',
};

const ADJUSTABLE_WITHOUT_ACTIONS_ISSUE: AccessibilityIssue = {
  rule: 'missing-adjust-actions',
  severity: 'warning',
  message:
    'An adjustable element is changed by swiping up and down, which needs the increment and decrement accessibilityActions.',
};

// VoiceOver sends increment and decrement to the handler whether or not they are declared.
const ADJUSTABLE_WITHOUT_HANDLER_ISSUE: AccessibilityIssue = {
  rule: 'missing-adjust-actions',
  severity: 'warning',
  message:
    'An adjustable element is changed by swiping up and down, which calls onAccessibilityAction with increment and decrement. Add the handler.',
};

const IOS_SLIDER_ROLE_ISSUE: AccessibilityIssue = {
  rule: 'invalid-role',
  severity: 'warning',
  message:
    'role="slider" gives no trait on iOS, so VoiceOver does not announce it as adjustable and swiping up or down does not change its value. Use accessibilityRole="adjustable" without role.',
};

const UNNAMED_ACTION_ISSUE: AccessibilityIssue = {
  rule: 'unhandled-actions',
  severity: 'error',
  message:
    'An accessibilityAction has no name, which crashes the app: on the old architecture once a screen reader inspects the element, on the New Architecture as soon as it mounts.',
};

// React Native requires a string `name` on every action; an empty one is accepted.
const hasUnnamedAction = (node: HostNode) => {
  const actions = node.props.accessibilityActions;
  return (
    isUnknownArray(actions) && actions.some((action) => typeof asObject(action).name !== 'string')
  );
};

const getMissingRoleIssue = (role: string | null): AccessibilityIssue => ({
  rule: 'missing-role',
  severity: 'warning',
  message: `${
    role
      ? `Control has role "${role}", which does not tell a screen reader`
      : 'Control has no role, so a screen reader does not say'
  } that it can be activated. Use role="button" (or link, tab, checkbox…).`,
});

export const getMissingRoleIssues = ({ role }: RoleInfo): AccessibilityIssue[] =>
  role != null && INTERACTIVE_ROLES.has(role) ? [] : [getMissingRoleIssue(role)];

// Native sliders announce their value and handle increment and decrement
// themselves; any other host with a slider role does neither.
const NATIVE_SLIDER_HOSTS = new Set(['RNCSlider']);

const isNativeSlider = (node: HostNode) => NATIVE_SLIDER_HOSTS.has(node.type);

// iOS takes its traits from the role string, which knows `adjustable` but not `slider`.
const isAdjustable = ({ node, role }: InspectedNode, platform: Platform) =>
  !isNativeSlider(node) &&
  (platform === 'ios'
    ? role.role === 'adjustable'
    : role.role != null && ADJUSTABLE_ROLES.has(role.role));

const isIosSliderRole = ({ node, role }: InspectedNode, platform: Platform) =>
  platform === 'ios' && role.role === 'slider' && !isNativeSlider(node);

/** `role` and `accessibilityRole` are checked apart: Android applies both. */
export const getInvalidRoleIssues = (
  { ariaRole, nativeRole }: RoleInfo,
  reactNativeVersion: ReactNativeVersion,
): AccessibilityIssue[] => {
  const issues: AccessibilityIssue[] = [];
  if (ariaRole && !ARIA_ROLES.has(ariaRole)) {
    issues.push({
      rule: 'invalid-role',
      severity: 'warning',
      message: `"${ariaRole}" is not a role React Native knows, so it is ignored.`,
    });
  }
  if (nativeRole && !ACCESSIBILITY_ROLES.has(nativeRole)) {
    issues.push({
      rule: 'invalid-role',
      // Not just unannounced: Android rejects the value and the view fails to mount.
      severity: 'error',
      message: `${
        ARIA_ROLES.has(nativeRole)
          ? `"${nativeRole}" is a value of the role prop, not of accessibilityRole.`
          : `"${nativeRole}" is not an accessibilityRole React Native knows.`
      } ${IOS_ONLY_ACCESSIBILITY_ROLES.has(nativeRole) ? 'iOS applies it, but' : 'iOS ignores it and'} Android throws.${
        ARIA_ROLES.has(nativeRole) ? ` Use role="${nativeRole}".` : ''
      }`,
    });
  }
  if (nativeRole === 'tabbar' && isTabBarRejectedOnAndroid(reactNativeVersion)) {
    issues.push({
      rule: 'invalid-role',
      severity: 'error',
      message: '"tabbar" makes Android throw before React Native 0.88.',
    });
  }
  return issues;
};

/** Checks of the role itself and of the state and value that role is expected to carry. */
export const getRoleIssues = (
  inspected: InspectedNode,
  platform: Platform,
  reactNativeVersion: ReactNativeVersion,
): AccessibilityIssue[] => {
  const { node, kind, role: roleInfo } = inspected;
  const issues = getInvalidRoleIssues(roleInfo, reactNativeVersion);
  const role = roleInfo.role ?? '';

  if (isIosSliderRole(inspected, platform)) {
    issues.push(IOS_SLIDER_ROLE_ISSUE);
  }

  // A native switch and a text input report their own state.
  if (kind !== 'switch' && kind !== 'input' && CHECKABLE_ROLES.has(role)) {
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

  if (VALUE_ROLES.has(role) && !isNativeSlider(node) && getValue(node) == null) {
    issues.push({
      rule: 'missing-value',
      severity: 'warning',
      message: `${/^[aeiou]/.test(role) ? 'An' : 'A'} ${role} has to announce its current value. Set accessibilityValue.text, or now together with min and max (or aria-valuetext, or aria-valuenow with aria-valuemin and aria-valuemax).`,
    });
  }

  return issues;
};

/** Checks of custom actions and of a control that cannot be used but is not announced as such. */
export const getBehaviorIssues = (
  inspected: InspectedNode,
  touchesBlocked: boolean,
  platform: Platform,
): AccessibilityIssue[] => {
  const { node, interactive, states, actions } = inspected;
  const issues: AccessibilityIssue[] = [];
  const hasHandler = typeof node.props.onAccessibilityAction === 'function';
  const adjustable = isAdjustable(inspected, platform);

  if (hasUnnamedAction(node)) {
    issues.push(UNNAMED_ACTION_ISSUE);
  }

  if (actions.length > 0 && !hasHandler) {
    issues.push({
      rule: 'unhandled-actions',
      severity: 'error',
      message: `Declares accessibilityActions (${actions.join(', ')}) but has no onAccessibilityAction, so choosing one does nothing.`,
    });
  } else if (actions.length === 0 && hasHandler && !(adjustable && platform === 'ios')) {
    issues.push(ACTIONS_WITHOUT_DECLARATION_ISSUE);
  }

  if (adjustable && platform === 'ios' && !hasHandler) {
    issues.push(ADJUSTABLE_WITHOUT_HANDLER_ISSUE);
  } else if (
    adjustable &&
    platform !== 'ios' &&
    !(actions.includes('increment') && actions.includes('decrement'))
  ) {
    issues.push(ADJUSTABLE_WITHOUT_ACTIONS_ISSUE);
  }

  if (interactive && touchesBlocked && !states.includes('disabled')) {
    issues.push(MISSING_DISABLED_STATE_ISSUE);
  }

  return issues;
};

export const getNestedIssue = (platform: Platform): AccessibilityIssue => ({
  rule: 'nested-interactive',
  severity: platform === 'ios' ? 'error' : 'warning',
  message:
    platform === 'ios'
      ? 'Control is nested inside another accessible element, so VoiceOver cannot focus it on its own. Set accessible={false} on the parent or move the control out of it.'
      : 'Control is nested inside another accessible element. TalkBack focuses it separately, without the text around it, and VoiceOver cannot focus it at all. Give it its own label, or move it out of the parent.',
});

export const getNotAccessibleIssue = (node: HostNode, platform: Platform): AccessibilityIssue => {
  const reason = isMarkedUnimportant(node, platform)
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

const hasLabelledBy = (value: unknown) =>
  isUnknownArray(value)
    ? value.some((id) => normalizeText(id) !== '')
    : normalizeText(value) !== '';

/**
 * The label and naming issues of a screen reader stop. `null` for an empty Text,
 * which renders nothing and is skipped by screen readers.
 */
export const getStopNaming = (
  { node, kind, interactive, role }: InspectedNode,
  platform: Platform,
): { label: string; issues: AccessibilityIssue[] } | null => {
  const { props } = node;
  const ownLabel = getLabel(node);
  const content = getAccessibleName(node, platform);
  const issues: AccessibilityIssue[] = [];
  let label = content;

  if (kind === 'input') {
    const placeholder = normalizeText(props.placeholder);
    // Only Android names an input after the view it is labelled by.
    const labelledBy = platform === 'android' && hasLabelledBy(props.accessibilityLabelledBy);
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
    issues.push(
      kind === 'image' && !interactive
        ? FOCUSABLE_IMAGE_MISSING_LABEL_ISSUE
        : {
            rule: 'missing-label',
            severity: interactive ? 'error' : 'warning',
            message: interactive
              ? 'Control has no accessible name. Add an accessibilityLabel or visible text.'
              : 'Element is focusable by screen readers but has nothing to announce. Add an accessibilityLabel or remove accessible.',
          },
    );
  }

  if (interactive && (kind === 'view' || kind === 'text' || kind === 'image')) {
    issues.push(...getMissingRoleIssues(role));
  }

  return { label, issues };
};

const getTouchSize = (node: HostNode, frame: Frame) => {
  const hitSlop = node.props.hitSlop;
  const slop = asObject(hitSlop);
  const edge = (key: string) => {
    if (typeof hitSlop === 'number') return hitSlop;
    const value = slop[key];
    return typeof value === 'number' ? value : 0;
  };
  return {
    width: frame.width + edge('left') + edge('right'),
    height: frame.height + edge('top') + edge('bottom'),
  };
};

export const getTouchTargetIssue = (
  node: HostNode,
  kind: AccessibilityElementKind,
  frame: Frame | null,
  platform: Platform,
): AccessibilityIssue | null => {
  // Links inside a paragraph are exempt from target-size rules (WCAG 2.5.8), and
  // UISwitch has the fixed 51×31pt size of Apple's own control.
  const isExempt = node.type === 'RCTVirtualText' || (kind === 'switch' && platform === 'ios');
  if (isExempt || !frame || frame.width <= 0 || frame.height <= 0) {
    return null;
  }
  const minTouchTarget = getMinTouchTarget(platform);
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
