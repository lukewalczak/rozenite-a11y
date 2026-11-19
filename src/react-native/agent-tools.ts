import {
  definePaginatedAgentToolContract,
  paginateArray,
  useRozenitePluginAgentTool,
  type AgentTool,
  type PageEnvelope,
} from '@rozenite/agent-bridge';
import { countIssues, ELEMENT_FILTERS, filterElements } from '../shared/filter-elements';
import type { ElementFilter } from '../shared/filter-elements';
import { ACCESSIBILITY_PLUGIN_ID } from '../shared/messaging';
import type {
  AccessibilityAudit,
  AccessibilityElement,
  AccessibilitySeverity,
} from '../shared/types';

export type RunAuditArgs = {
  filter?: ElementFilter;
  severity?: AccessibilitySeverity;
  search?: string;
  limit?: number;
  cursor?: string;
};

export type RunAuditResult = {
  items: AccessibilityElement[];
  page: PageEnvelope;
  platform: AccessibilityAudit['platform'];
  minTouchTarget: number;
  system: AccessibilityAudit['system'];
  summary: { elements: number; focusable: number; errors: number; warnings: number };
};

export type HighlightArgs = { id?: string | number | null };

const runAuditTool = definePaginatedAgentToolContract<RunAuditArgs, RunAuditResult>({
  name: 'run-audit',
  description:
    'Audit the accessibility of the screen the app is showing, from the React Native component tree. ' +
    'Returns the elements a screen reader stops on, in reading order, with what it announces and the rules each one breaks. ' +
    '`component` and `componentPath` name the components to look for in the code. ' +
    'Frames are in points on iOS and dp on Android. ' +
    'Each call without a cursor audits again, so call it after navigating or after a fix has reloaded.',
  readOnly: true,
  inputSchema: {
    type: 'object',
    properties: {
      filter: {
        type: 'string',
        enum: [...ELEMENT_FILTERS],
        description:
          '`issues` (default): elements that break a rule. `all`: every element. `live`: live regions.',
      },
      severity: {
        type: 'string',
        enum: ['error', 'warning'],
        description: 'Only elements with issues of this severity, and only those issues.',
      },
      search: {
        type: 'string',
        description: 'Match the announcement, component, host view, rule ID or rule title.',
      },
      limit: {
        type: 'number',
        description: 'Page size. Defaults to 20 and is capped at 100.',
      },
      cursor: {
        type: 'string',
        description:
          'Cursor from a previous page. Pages through the same audit instead of auditing again.',
      },
    },
  },
  pagination: {
    kind: 'cursor',
    fields: [
      'id',
      'kind',
      'hostType',
      'component',
      'componentPath',
      'label',
      'role',
      'hint',
      'value',
      'states',
      'actions',
      'liveRegion',
      'interactive',
      'focusable',
      'announcement',
      'frame',
      'issues',
    ],
    defaultFields: ['id', 'component', 'componentPath', 'announcement', 'focusable', 'issues'],
    meta: ['platform', 'minTouchTarget', 'system', 'summary'],
  },
});

const highlightTool: AgentTool = {
  name: 'highlight',
  description:
    'Outline an element from the latest run-audit in the app, for example before taking a screenshot. ' +
    'Call it without `id` to clear the outline.',
  idempotent: true,
  inputSchema: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        description: 'Element `id` from the latest run-audit. Omit it to clear the outline.',
      },
    },
  },
};

export const getAuditPage = (audit: AccessibilityAudit, args: RunAuditArgs): RunAuditResult => {
  const filter = args.filter ?? 'issues';
  const search = args.search ?? '';
  const severity = args.severity;

  let items = filterElements(audit.elements, filter, search);
  if (severity) {
    items = items.flatMap((element) => {
      const issues = element.issues.filter((issue) => issue.severity === severity);
      return issues.length > 0 ? [{ ...element, issues }] : [];
    });
  }

  const { items: pageItems, page } = paginateArray(items, {
    keyOf: (element) => element.id,
    limit: args.limit,
    cursor: args.cursor,
    scope: JSON.stringify([filter, severity ?? null, search]),
    generation: audit.takenAt,
  });

  return {
    items: pageItems,
    page,
    platform: audit.platform,
    minTouchTarget: audit.minTouchTarget,
    system: audit.system,
    summary: {
      elements: audit.elements.length,
      focusable: audit.elements.filter((element) => element.focusable).length,
      ...countIssues(audit.elements),
    },
  };
};

type AgentToolsOptions = {
  runAudit: () => Promise<AccessibilityAudit>;
  getLatestAudit: () => AccessibilityAudit | null;
  /** Resolves to `false` when the element is not on screen. */
  highlight: (id: string | null) => Promise<boolean>;
};

export const useAccessibilityAgentTools = ({
  runAudit,
  getLatestAudit,
  highlight,
}: AgentToolsOptions) => {
  useRozenitePluginAgentTool({
    pluginId: ACCESSIBILITY_PLUGIN_ID,
    tool: runAuditTool,
    handler: async (args) => {
      // A cursor belongs to the audit that produced it; once a newer audit
      // replaces that one, paging answers `reset: true`.
      const audit = (args.cursor ? getLatestAudit() : null) ?? (await runAudit());
      return getAuditPage(audit, args);
    },
  });

  useRozenitePluginAgentTool<HighlightArgs, { highlighted: boolean }>({
    pluginId: ACCESSIBILITY_PLUGIN_ID,
    tool: highlightTool,
    handler: async (args) => {
      // Ids are strings, but an SDK caller may pass the number it sees.
      const id = args.id == null ? null : String(args.id);
      const highlighted = await highlight(id);
      if (id != null && !highlighted) {
        throw new Error(
          `Element "${id}" is not on screen. Ids come from the latest run-audit; run it again.`,
        );
      }
      return { highlighted };
    },
  });
};
