import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AccessibilityElementKind, Platform } from '../../../react-native';

const platform = vi.hoisted(() => ({ OS: 'ios' }));
vi.mock('react-native', () => ({ Platform: platform }));

const loadComponent = async (nodeEnv: string, os: string) => {
  vi.resetModules();
  vi.stubEnv('NODE_ENV', nodeEnv);
  platform.OS = os;
  return (await import('../../../react-native')).RozeniteAccessibility;
};

describe('RozeniteAccessibility entry', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('renders nothing on platforms other than iOS and Android', async () => {
    const RozeniteAccessibility = await loadComponent('development', 'web');

    expect(RozeniteAccessibility()).toBeNull();
  });

  it('renders nothing in tests and in production', async () => {
    expect((await loadComponent('test', 'ios'))()).toBeNull();
    expect((await loadComponent('production', 'android'))()).toBeNull();
  });

  it('exports the platform and element kind types', () => {
    const exported: [Platform, AccessibilityElementKind] = ['ios', 'view'];

    expect(exported).toHaveLength(2);
  });
});
