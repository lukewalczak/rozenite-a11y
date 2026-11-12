import type { AccessibilityElement } from '../shared/types';

export type ElementFilter = 'all' | 'issues';

export const countIssues = (elements: AccessibilityElement[]) => {
  let errors = 0;
  let warnings = 0;
  for (const element of elements) {
    for (const issue of element.issues) {
      if (issue.severity === 'error') errors += 1;
      else warnings += 1;
    }
  }
  return { errors, warnings };
};

export const filterElements = (
  elements: AccessibilityElement[],
  filter: ElementFilter,
  search: string,
): AccessibilityElement[] => {
  const term = search.trim().toLowerCase();

  return elements.filter((element) => {
    if (filter === 'issues' && element.issues.length === 0) {
      return false;
    }
    if (!term) {
      return true;
    }
    return [
      element.announcement,
      element.component ?? '',
      element.hostType,
      ...element.issues.map((issue) => issue.rule),
    ].some((value) => value.toLowerCase().includes(term));
  });
};
