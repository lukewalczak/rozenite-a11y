import type { PlatformOSType } from 'react-native';

export type Platform = PlatformOSType;

export type Frame = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type AccessibilitySeverity = 'error' | 'warning';

export type AccessibilityRuleId =
  | 'missing-label'
  | 'missing-role'
  | 'input-missing-label'
  | 'image-missing-label'
  | 'small-touch-target'
  | 'nested-interactive'
  | 'not-accessible'
  | 'invalid-role'
  | 'missing-state'
  | 'missing-value'
  | 'font-scaling-disabled'
  | 'unhandled-actions'
  | 'unused-action-handler'
  | 'missing-adjust-actions'
  | 'missing-disabled-state';

export type AccessibilityIssue = {
  rule: AccessibilityRuleId;
  severity: AccessibilitySeverity;
  message: string;
};

export type LiveRegion = 'polite' | 'assertive';

export type AccessibilityElementKind = 'view' | 'text' | 'image' | 'input' | 'switch';

export type AccessibilityElement = {
  /** Stable only within the audit that produced it. */
  id: string;
  kind: AccessibilityElementKind;
  /** Host component name, e.g. `RCTView`. */
  hostType: string;
  /** App component that rendered the element, else the nearest one above it; `null` when none could be told apart from React Native's own. */
  component: string | null;
  /** Composite components above the host element, outermost first. */
  componentPath: string[];
  /** Explicit label, or the text a screen reader derives from the content. */
  label: string;
  role: string | null;
  hint: string | null;
  /** Current value of an adjustable element, e.g. a slider. */
  value: string | null;
  states: string[];
  /** Names of the custom `accessibilityActions`. */
  actions: string[];
  /** Set when changes are announced without focus. */
  liveRegion: LiveRegion | null;
  interactive: boolean;
  /**
   * Whether a screen reader can focus the element. `false` for elements listed
   * only because they have an issue or are a live region, such as a control
   * nested in another one on iOS.
   */
  focusable: boolean;
  /** Approximation of what a screen reader says when the element is focused. */
  announcement: string;
  /** Position in window coordinates, or `null` when it could not be measured. */
  frame: Frame | null;
  issues: AccessibilityIssue[];
};

export type AccessibilitySystemState = {
  screenReaderEnabled: boolean;
  reduceMotionEnabled: boolean;
  boldTextEnabled: boolean;
  grayscaleEnabled: boolean;
  invertColorsEnabled: boolean;
  reduceTransparencyEnabled: boolean;
  fontScale: number;
};

export type AccessibilityAudit = {
  platform: Platform;
  /** Minimum touch target edge for the platform, in points / dp. */
  minTouchTarget: number;
  /** In the order the tree is traversed, which approximates reading order. */
  elements: AccessibilityElement[];
  system: AccessibilitySystemState;
  takenAt: number;
};
