export type {
  AccessibilityAudit,
  AccessibilityElement,
  AccessibilityIssue,
  AccessibilityRuleId,
  AccessibilitySeverity,
  AccessibilitySystemState,
  Frame,
  LiveRegion,
} from './src/shared/types';

export let RozeniteAccessibility: typeof import('./src/react-native/RozeniteAccessibility').RozeniteAccessibility;

const isDev = process.env.NODE_ENV !== 'production';
const isServer = typeof window === 'undefined';

if (isDev && !isServer) {
  RozeniteAccessibility = require('./src/react-native/RozeniteAccessibility').RozeniteAccessibility;
} else {
  RozeniteAccessibility = () => null;
}
