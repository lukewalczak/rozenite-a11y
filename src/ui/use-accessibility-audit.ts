import {
  createRozeniteRpc,
  isHandlerError,
  isProtocolError,
  useRozeniteDevToolsClient,
} from '@rozenite/plugin-bridge';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ACCESSIBILITY_PLUGIN_ID,
  DEVICE_READY_EVENT,
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

export const useAccessibilityAudit = () => {
  const client = useRozeniteDevToolsClient({
    pluginId: ACCESSIBILITY_PLUGIN_ID,
  });

  const rpc = useMemo(
    () => (client ? createRozeniteRpc<AccessibilityMethods>(client) : null),
    [client],
  );

  useEffect(
    () => () => {
      if (!rpc) {
        return;
      }
      // Clear the outline before closing; a failure only means there is none to clear.
      void Promise.resolve()
        .then(() => rpc.method('highlight').invoke({ id: null }))
        .catch(() => undefined)
        .finally(() => rpc.close());
    },
    [rpc],
  );

  const [audit, setAudit] = useState<AccessibilityAudit | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const latestRunRef = useRef(0);

  const run = useCallback(async () => {
    if (!rpc) {
      return;
    }
    // An answer to an older run must not replace the result of a newer one.
    const runId = ++latestRunRef.current;
    const isLatest = () => runId === latestRunRef.current;
    setIsRunning(true);
    try {
      const result = await rpc.method('runAudit').invoke();
      if (isLatest()) {
        setAudit(result);
        setError(null);
      }
    } catch (caught) {
      if (isLatest() && !(isProtocolError(caught) && caught.code === 'CLIENT_CLOSED')) {
        setError(describeError(caught));
      }
    } finally {
      if (isLatest()) {
        setIsRunning(false);
      }
    }
  }, [rpc]);

  useEffect(() => {
    void run();
  }, [run]);

  useEffect(() => {
    const subscription = client?.onMessage(DEVICE_READY_EVENT, () => void run());
    return () => subscription?.remove();
  }, [client, run]);

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
