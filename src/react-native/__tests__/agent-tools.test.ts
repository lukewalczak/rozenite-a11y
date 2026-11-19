import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccessibilityAudit, AccessibilityElement } from '../../shared/types';

type RegisteredTool = {
  pluginId: string;
  tool: { name: string };
  handler: (args: never) => unknown;
};

const registered = vi.hoisted(() => [] as RegisteredTool[]);
vi.mock('@rozenite/agent-bridge', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@rozenite/agent-bridge')>()),
  useRozenitePluginAgentTool: (options: RegisteredTool) => {
    registered.push(options);
  },
}));

const { getAuditPage, useAccessibilityAgentTools } = await import('../agent-tools');

const element = (
  id: string,
  overrides: Partial<AccessibilityElement> = {},
): AccessibilityElement => ({
  id,
  kind: 'view',
  hostType: 'RCTView',
  component: null,
  componentPath: [],
  role: null,
  hint: null,
  value: null,
  states: [],
  actions: [],
  liveRegion: null,
  interactive: false,
  focusable: true,
  announcement: '',
  label: '',
  frame: null,
  issues: [],
  ...overrides,
});

const makeAudit = (elements: AccessibilityElement[], takenAt = 1): AccessibilityAudit => ({
  platform: 'ios',
  minTouchTarget: 44,
  elements,
  system: {
    screenReaderEnabled: false,
    reduceMotionEnabled: false,
    boldTextEnabled: false,
    grayscaleEnabled: false,
    invertColorsEnabled: false,
    reduceTransparencyEnabled: false,
    fontScale: 1,
  },
  takenAt,
});

const audit = makeAudit([
  element('0', { announcement: 'Welcome' }),
  element('1', {
    component: 'AddToCart',
    issues: [
      { rule: 'missing-label', severity: 'error', message: 'No label' },
      { rule: 'small-touch-target', severity: 'warning', message: 'Too small' },
    ],
  }),
  element('2', {
    focusable: false,
    liveRegion: 'polite',
    issues: [{ rule: 'missing-role', severity: 'warning', message: 'No role' }],
  }),
]);

describe('getAuditPage', () => {
  it('lists elements with issues by default, with a summary of the whole audit', () => {
    const result = getAuditPage(audit, {});

    expect(result.items.map((item) => item.id)).toEqual(['1', '2']);
    expect(result.summary).toEqual({ elements: 3, focusable: 2, errors: 1, warnings: 2 });
    expect(result.platform).toBe('ios');
    expect(result.minTouchTarget).toBe(44);
  });

  it('filters by kind of element and by search', () => {
    expect(getAuditPage(audit, { filter: 'all' }).items).toHaveLength(3);
    expect(getAuditPage(audit, { filter: 'live' }).items.map((item) => item.id)).toEqual(['2']);
    expect(getAuditPage(audit, { search: 'addtocart' }).items.map((item) => item.id)).toEqual([
      '1',
    ]);
  });

  it('keeps only the issues of the requested severity', () => {
    const errors = getAuditPage(audit, { severity: 'error' }).items;

    expect(errors.map((item) => item.id)).toEqual(['1']);
    expect(errors[0].issues.map((issue) => issue.rule)).toEqual(['missing-label']);
  });

  it('pages through the same audit and resets for a newer one', () => {
    const first = getAuditPage(audit, { filter: 'all', limit: 2 });
    expect(first.items.map((item) => item.id)).toEqual(['0', '1']);
    expect(first.page.hasMore).toBe(true);

    const second = getAuditPage(audit, { filter: 'all', limit: 2, cursor: first.page.nextCursor });
    expect(second.items.map((item) => item.id)).toEqual(['2']);
    expect(second.page.hasMore).toBe(false);

    const newer = makeAudit(audit.elements, 2);
    expect(
      getAuditPage(newer, { filter: 'all', limit: 2, cursor: first.page.nextCursor }).page.reset,
    ).toBe(true);
  });
});

describe('useAccessibilityAgentTools', () => {
  const runAudit = vi.fn(async () => audit);
  const highlight = vi.fn(async (_id: string | null) => true);
  let latest: AccessibilityAudit | null = null;

  const getHandler = (name: string) => {
    const tool = registered.find((entry) => entry.tool.name === name);
    if (!tool) throw new Error(`${name} is not registered`);
    expect(tool.pluginId).toBe('rozenite-a11y');
    return tool.handler as (args: unknown) => Promise<unknown>;
  };

  beforeEach(() => {
    registered.length = 0;
    runAudit.mockClear();
    highlight.mockClear();
    latest = null;
    useAccessibilityAgentTools({ runAudit, getLatestAudit: () => latest, highlight });
  });

  it('audits again without a cursor and pages the latest audit with one', async () => {
    const handler = getHandler('run-audit');

    const first = (await handler({ filter: 'all', limit: 2 })) as ReturnType<typeof getAuditPage>;
    expect(runAudit).toHaveBeenCalledTimes(1);

    latest = audit;
    const second = (await handler({
      filter: 'all',
      limit: 2,
      cursor: first.page.nextCursor,
    })) as ReturnType<typeof getAuditPage>;
    expect(runAudit).toHaveBeenCalledTimes(1);
    expect(second.items.map((item) => item.id)).toEqual(['2']);
  });

  it('highlights an element and reports one that is not on screen', async () => {
    const handler = getHandler('highlight');

    await expect(handler({ id: '1' })).resolves.toEqual({ highlighted: true });
    await expect(handler({ id: 1 })).resolves.toEqual({ highlighted: true });
    expect(highlight).toHaveBeenLastCalledWith('1');

    highlight.mockResolvedValueOnce(false);
    await expect(handler({ id: '9' })).rejects.toThrow('not on screen');

    highlight.mockResolvedValueOnce(false);
    await expect(handler({})).resolves.toEqual({ highlighted: false });
  });
});
