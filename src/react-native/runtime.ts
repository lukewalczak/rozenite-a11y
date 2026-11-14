import type { Frame } from '../shared/types';
import type { FiberLike } from './host-tree';
import { asObject } from './values';

type DevToolsHook = {
  renderers?: Map<number, unknown>;
  getFiberRoots?: (rendererId: number) => Iterable<{ current?: FiberLike | null }>;
};

type FabricUIManager = {
  getBoundingClientRect?: (
    node: unknown,
    includeTransform: boolean,
  ) => [number, number, number, number] | null | undefined;
};

type Globals = {
  __REACT_DEVTOOLS_GLOBAL_HOOK__?: DevToolsHook;
  nativeFabricUIManager?: FabricUIManager;
};

/**
 * Root fibers of every mounted React tree, read through the hook React
 * DevTools installs in development. `null` when the hook is not there.
 */
export const getFiberRoots = (): FiberLike[] | null => {
  const hook = (globalThis as Globals).__REACT_DEVTOOLS_GLOBAL_HOOK__;
  if (!hook?.renderers || typeof hook.getFiberRoots !== 'function') {
    return null;
  }

  const roots: FiberLike[] = [];
  for (const rendererId of hook.renderers.keys()) {
    for (const root of hook.getFiberRoots(rendererId)) {
      if (root.current) {
        roots.push(root.current);
      }
    }
  }
  return roots;
};

const toFrame = (x: unknown, y: unknown, width: unknown, height: unknown): Frame | null => {
  if (
    typeof x !== 'number' ||
    typeof y !== 'number' ||
    typeof width !== 'number' ||
    typeof height !== 'number'
  ) {
    return null;
  }
  return { x, y, width, height };
};

/** Measures a host fiber's `stateNode` in window coordinates, synchronously. */
export const measureHostInstance = (stateNode: unknown): Frame | null => {
  try {
    // A Fabric instance, whose shadow node the UI manager can measure directly.
    const shadowNode = asObject(stateNode).node;
    const uiManager = (globalThis as Globals).nativeFabricUIManager;
    if (shadowNode && typeof uiManager?.getBoundingClientRect === 'function') {
      const rect = uiManager.getBoundingClientRect(shadowNode, true);
      return rect ? toFrame(rect[0], rect[1], rect[2], rect[3]) : null;
    }
  } catch {
    // An unmounted or otherwise unmeasurable node has no frame.
  }

  return null;
};
