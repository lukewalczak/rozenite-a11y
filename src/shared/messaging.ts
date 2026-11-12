import type { AccessibilityAudit } from './types';

export const ACCESSIBILITY_PLUGIN_ID = 'rozenite-a11y';

/**
 * RPC methods exposed by the device peer, called by the panel via
 * `createRozeniteRpc`.
 */
export type AccessibilityMethods = {
  runAudit: () => Promise<AccessibilityAudit>;
  /** Pass `id: null` to clear. Ids come from the most recent `runAudit`. */
  highlight: (params: { id: string | null }) => Promise<{ highlighted: boolean }>;
};

export type AccessibilityEventMap = Record<string, unknown>;
