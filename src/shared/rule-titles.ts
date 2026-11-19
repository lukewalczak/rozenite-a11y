import type { AccessibilityRuleId } from './types';

export const RULE_TITLES: Record<AccessibilityRuleId, string> = {
  'missing-label': 'Missing label',
  'missing-role': 'Missing role',
  'input-missing-label': 'Input without a label',
  'image-missing-label': 'Image without a label',
  'small-touch-target': 'Small touch target',
  'nested-interactive': 'Nested control',
  'not-accessible': 'Hidden from screen readers',
  'invalid-role': 'Invalid role',
  'missing-state': 'Missing state',
  'missing-value': 'Missing value',
  'font-scaling-disabled': 'Font scaling disabled',
  'unhandled-actions': 'Unhandled actions',
  'unused-action-handler': 'Action handler without actions',
  'missing-adjust-actions': 'Missing increment and decrement',
  'missing-disabled-state': 'Missing disabled state',
};
