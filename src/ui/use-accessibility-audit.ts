import {
  createRozeniteRpc,
  isHandlerError,
  isProtocolError,
  useRozeniteDevToolsClient,
} from '@rozenite/plugin-bridge';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ACCESSIBILITY_PLUGIN_ID,
  type AccessibilityMethods,
} from '../shared/messaging';
import type { AccessibilityAudit } from '../shared/types';

const describeError = (error: unknown): string => {
  if (isHandlerError(error)) {
    return error.remote.message;
  }
  if (isProtocolError(error) && error.code === 'ACK_TIMEOUT') {
    return 'The app did not answer. Check that <RozeniteAccessibility /> is rendered in your app.';
  }
  return error instanceof Error ? error.message : String(error);
};

/** Owns the RPC client and the most recent audit. */
export const useAccessibilityAudit = () => {
  const client = useRozeniteDevToolsClient({
    pluginId: ACCESSIBILITY_PLUGIN_ID,
  });

  const rpc = useMemo(
    () => (client ? createRozeniteRpc<AccessibilityMethods>(client) : null),
    [client],
  );

  useEffect(() => () => rpc?.close(), [rpc]);

  const [audit, setAudit] = useState<AccessibilityAudit | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    if (!rpc) {
      return;
    }
    setIsRunning(true);
    try {
      setAudit(await rpc.method('runAudit').invoke());
      setError(null);
    } catch (caught) {
      if (isProtocolError(caught) && caught.code === 'CLIENT_CLOSED') {
        return;
      }
      setError(describeError(caught));
    } finally {
      setIsRunning(false);
    }
  }, [rpc]);

  useEffect(() => {
    void run();
  }, [run]);

  const highlight = useCallback(
    (id: string | null) => {
      // Best effort: a missed outline is not worth surfacing as an error.
      rpc
        ?.method('highlight')
        .invoke({ id })
        .catch(() => undefined);
    },
    [rpc],
  );

  return { connected: rpc != null, audit, isRunning, error, run, highlight };
};
