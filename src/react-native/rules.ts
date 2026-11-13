import type { AccessibilityIssue, Frame, Platform } from '../shared/types';
import { formatNumber, roundToTenth } from '../shared/format';
import type { HostNode } from './host-tree';
import {
  asObject,
  asString,
  getValue,
  isCustomAdjustable,
  readState,
  type InspectedNode,
} from './props';
import {
  ACCESSIBILITY_ROLES,
  ADJUSTABLE_ROLES,
  ARIA_ROLES,
  CHECKABLE_ROLES,
  VALUE_ROLES,
} from './roles';
import { collectText } from './visibility';

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

const MISSING_ROLE_ISSUE: AccessibilityIssue = {
  rule: 'missing-role',
  severity: 'warning',
  message:
    'Control has no role, so a screen reader does not say that it can be activated. Add role="button" (or link, tab, checkbox…).',
};

const MISSING_DISABLED_STATE_ISSUE: AccessibilityIssue = {
  rule: 'missing-disabled-state',
  severity: 'warning',
  message:
    'Control ignores touches (pointerEvents) but is not marked disabled, so a screen reader announces it as usable. Set aria-disabled (or accessibilityState.disabled).',
};

const ACTIONS_WITHOUT_DECLARATION_ISSUE: AccessibilityIssue = {
  rule: 'unhandled-actions',
  severity: 'warning',
  message:
    'Has onAccessibilityAction but declares no accessibilityActions, so a screen reader offers nothing to call it with.',
};

const ADJUSTABLE_WITHOUT_ACTIONS_ISSUE: AccessibilityIssue = {
  rule: 'unhandled-actions',
  severity: 'warning',
  message:
    'An adjustable element is changed by swiping up and down, which needs the increment and decrement accessibilityActions.',
};

const getInvalidRoleIssue = ({ ariaRole, nativeRole }: InspectedNode['role']) => {
  if (ariaRole) {
    return ARIA_ROLES.has(ariaRole)
      ? null
      : {
          rule: 'invalid-role',
          severity: 'warning',
          message: `"${ariaRole}" is not a role React Native knows, so it is ignored.`,
        } satisfies AccessibilityIssue;
  }
  if (!nativeRole || ACCESSIBILITY_ROLES.has(nativeRole)) {
    return null;
  }
  return {
    rule: 'invalid-role',
    // Not just unannounced: Android rejects the value and the view fails to mount.
    severity: 'error',
    message: ARIA_ROLES.has(nativeRole)
      ? `"${nativeRole}" is a value of the role prop, not of accessibilityRole. iOS ignores it and Android throws. Use role="${nativeRole}".`
      : `"${nativeRole}" is not an accessibilityRole React Native knows. iOS ignores it and Android throws.`,
  } satisfies AccessibilityIssue;
};

/** Checks of the role itself and of the state and value that role is expected to carry. */
export const getRoleIssues = ({
  node,
  kind,
  role: roleInfo,
}: InspectedNode): AccessibilityIssue[] => {
  const issues: AccessibilityIssue[] = [];
  const invalidRole = getInvalidRoleIssue(roleInfo);
  if (invalidRole) {
    issues.push(invalidRole);
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

/** Checks of custom actions and of a control that cannot be used but is not announced as such. */
export const getBehaviorIssues = (
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
    issues.push(ACTIONS_WITHOUT_DECLARATION_ISSUE);
  }

  if (
    isCustomAdjustable(node, role.role) &&
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

export const getNotAccessibleIssue = (node: HostNode): AccessibilityIssue => {
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

/**
 * The label and naming issues of a screen reader stop. `null` for an empty Text,
 * which renders nothing and is skipped by screen readers.
 */
export const getStopLabel = (
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
    issues.push(MISSING_ROLE_ISSUE);
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

export const getTouchTargetIssue = (
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
