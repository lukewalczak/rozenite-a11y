// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEVICE_READY_EVENT } from '../../shared/messaging';
import { useAccessibilityAudit } from '../use-accessibility-audit';

const bridge = vi.hoisted(() => {
  const listeners = new Map<string, () => void>();
  const calls: string[] = [];
  const invoke = (name: string) => async (params?: unknown) => {
    calls.push(params === undefined ? name : `${name} ${JSON.stringify(params)}`);
    return name === 'runAudit' ? { takenAt: calls.length } : undefined;
  };
  const client = {
    onMessage: (event: string, listener: () => void) => {
      listeners.set(event, listener);
      return { remove: () => listeners.delete(event) };
    },
  };
  const rpc = {
    method: (name: string) => ({ invoke: invoke(name) }),
    close: () => calls.push('close'),
  };
  return { listeners, calls, client, rpc };
});

vi.mock('@rozenite/plugin-bridge', () => ({
  useRozeniteDevToolsClient: () => bridge.client,
  createRozeniteRpc: () => bridge.rpc,
  isHandlerError: () => false,
  isProtocolError: () => false,
}));

describe('useAccessibilityAudit', () => {
  beforeEach(() => {
    bridge.listeners.clear();
    bridge.calls.length = 0;
  });

  it('audits again when the app says it is ready, as after a reload', async () => {
    const { result } = renderHook(() => useAccessibilityAudit());
    await waitFor(() => expect(result.current.audit).toMatchObject({ takenAt: 1 }));

    act(() => bridge.listeners.get(DEVICE_READY_EVENT)?.());

    await waitFor(() => expect(result.current.audit).toMatchObject({ takenAt: 2 }));
    expect(bridge.calls).toEqual(['runAudit', 'runAudit']);
  });

  it('clears the outline before closing the connection', async () => {
    const { result, unmount } = renderHook(() => useAccessibilityAudit());
    await waitFor(() => expect(result.current.audit).not.toBeNull());

    unmount();

    await waitFor(() => expect(bridge.calls).toContain('close'));
    expect(bridge.calls).toEqual(['runAudit', 'highlight {"id":null}', 'close']);
  });
});
