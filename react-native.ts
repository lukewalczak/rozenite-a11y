import { Platform } from 'react-native';

export type {
  AccessibilityAudit,
  AccessibilityElement,
  AccessibilityElementKind,
  AccessibilityIssue,
  AccessibilityRuleId,
  AccessibilitySeverity,
  AccessibilitySystemState,
  Frame,
  LiveRegion,
  Platform,
} from './src/shared/types';

export let RozeniteAccessibility: typeof import('./src/react-native/RozeniteAccessibility').RozeniteAccessibility;

// Written inline so the bundler can drop the audit from production and web builds.
// Tests have no DevTools to connect to, and the Rozenite client throws without them.
if (
  process.env.NODE_ENV !== 'production' &&
  process.env.NODE_ENV !== 'test' &&
  (Platform.OS === 'ios' || Platform.OS === 'android')
) {
  RozeniteAccessibility = require('./src/react-native/RozeniteAccessibility').RozeniteAccessibility;
} else {
  RozeniteAccessibility = () => null;
}
