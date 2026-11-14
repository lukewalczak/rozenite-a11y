import { afterEach, describe, expect, it, vi } from 'vitest';
import { measureHostInstance } from '../runtime';

describe('measureHostInstance', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('measures the shadow node of a Fabric instance through the UI manager', () => {
    const shadowNode = {};
    const getBoundingClientRect = vi.fn(() => [10, 20, 100, 50]);
    vi.stubGlobal('nativeFabricUIManager', { getBoundingClientRect });

    expect(measureHostInstance({ node: shadowNode })).toEqual({
      x: 10,
      y: 20,
      width: 100,
      height: 50,
    });
    expect(getBoundingClientRect).toHaveBeenCalledWith(shadowNode, true);
  });

  it('does not call getBoundingClientRect on the instance itself', () => {
    const getBoundingClientRect = vi.fn(() => ({ x: 0, y: 0, width: 100, height: 50 }));

    expect(measureHostInstance({ getBoundingClientRect })).toBeNull();
    expect(getBoundingClientRect).not.toHaveBeenCalled();
  });

  it('has no frame for a node that cannot be measured', () => {
    vi.stubGlobal('nativeFabricUIManager', {
      getBoundingClientRect: () => {
        throw new Error('unmounted');
      },
    });

    expect(measureHostInstance({ node: {} })).toBeNull();
    expect(measureHostInstance(null)).toBeNull();
  });
});
