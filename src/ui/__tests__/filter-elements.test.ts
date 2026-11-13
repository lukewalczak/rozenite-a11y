import { describe, expect, it } from 'vitest';
import type { AccessibilityElement } from '../../shared/types';
import { filterElements } from '../filter-elements';

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

const elements = [
  element('plain', { announcement: 'Welcome' }),
  element('broken', {
    component: 'SaveButton',
    issues: [{ rule: 'missing-label', severity: 'error', message: '' }],
  }),
  element('live', { liveRegion: 'polite', announcement: 'Saved' }),
];

const ids = (filter: 'all' | 'issues' | 'live', search = '') =>
  filterElements(elements, filter, search).map((item) => item.id);

describe('filterElements', () => {
  it('filters by issues and live regions', () => {
    expect(ids('all')).toEqual(['plain', 'broken', 'live']);
    expect(ids('issues')).toEqual(['broken']);
    expect(ids('live')).toEqual(['live']);
  });

  it('searches announcement, component and rule', () => {
    expect(ids('all', ' welcome ')).toEqual(['plain']);
    expect(ids('all', 'savebutton')).toEqual(['broken']);
    expect(ids('all', 'missing-label')).toEqual(['broken']);
    expect(ids('live', 'welcome')).toEqual([]);
  });
});
