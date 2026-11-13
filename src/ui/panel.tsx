import {
  Alert,
  AlertTriangle,
  Badge,
  CheckCircle2,
  DescriptionList,
  EmptyState,
  IndicatorDot,
  Info,
  List,
  PluginShell,
  RefreshCw,
  SearchField,
  Split,
  Text,
  ToggleGroup,
  Toolbar,
} from '@rozenite/ui';
import { useEffect, useMemo, useState } from 'react';
import type {
  AccessibilityAudit,
  AccessibilityElement,
  AccessibilityRuleId,
  AccessibilitySystemState,
} from '../shared/types';
import { countIssues, filterElements, type ElementFilter } from './filter-elements';
import { useAccessibilityAudit } from './use-accessibility-audit';
import './globals.css';

const RULE_TITLES: Record<AccessibilityRuleId, string> = {
  'missing-label': 'Missing label',
  'missing-role': 'Missing role',
  'input-missing-label': 'Input without a label',
  'image-missing-label': 'Image without a label',
  'small-touch-target': 'Small touch target',
  'nested-interactive': 'Nested control',
  'not-accessible': 'Hidden from screen readers',
  'invalid-role': 'Invalid role',
  'missing-state': 'Missing state',
  'missing-value': 'Missing value',
  'font-scaling-disabled': 'Font scaling disabled',
  'unhandled-actions': 'Accessibility actions',
  'missing-disabled-state': 'Missing disabled state',
};

const getTone = (element: AccessibilityElement) => {
  if (element.issues.some((issue) => issue.severity === 'error')) return 'danger';
  if (element.issues.length > 0) return 'warning';
  return 'success';
};

const formatNumber = (value: number) => String(Math.round(value * 10) / 10);

function ElementRow({
  element,
  selected,
  onSelect,
}: {
  element: AccessibilityElement;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <List.Item
      selected={selected}
      onClick={onSelect}
      className="rounded-none"
      leading={<IndicatorDot tone={getTone(element)} size="lg" />}
      trailing={
        <span className="flex shrink-0 items-center gap-2">
          {element.component && (
            <span className="font-mono text-xs text-faint">{element.component}</span>
          )}
          {element.issues.length > 0 && (
            <Badge tone={getTone(element)} variant="soft" size="sm">
              {element.issues.length}
            </Badge>
          )}
        </span>
      }
    >
      {element.announcement || <span className="text-faint">Nothing to announce</span>}
    </List.Item>
  );
}

function ElementDetails({
  element,
  minTouchTarget,
}: {
  element: AccessibilityElement;
  minTouchTarget: number;
}) {
  const { frame } = element;

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex flex-col gap-1">
        <Text variant="label">Screen reader says</Text>
        <p className="text-sm text-foreground">
          {element.focusable ? (
            element.announcement ? (
              `“${element.announcement}”`
            ) : (
              <span className="text-muted-foreground">Nothing.</span>
            )
          ) : (
            <span className="text-muted-foreground">
              Nothing. A screen reader cannot focus this element.
            </span>
          )}
        </p>
      </div>

      {element.issues.length === 0 ? (
        <Alert tone="success">
          <Alert.Description>No issues found for this element.</Alert.Description>
        </Alert>
      ) : (
        element.issues.map((issue) => (
          <Alert key={issue.rule} tone={issue.severity === 'error' ? 'danger' : 'warning'}>
            <Alert.Title>{RULE_TITLES[issue.rule]}</Alert.Title>
            <Alert.Description>{issue.message}</Alert.Description>
          </Alert>
        ))
      )}

      <DescriptionList>
        <DescriptionList.Item label="Label">{element.label || '—'}</DescriptionList.Item>
        <DescriptionList.Item label="Role">{element.role ?? '—'}</DescriptionList.Item>
        <DescriptionList.Item label="Hint">{element.hint ?? '—'}</DescriptionList.Item>
        <DescriptionList.Item label="Value">{element.value ?? '—'}</DescriptionList.Item>
        <DescriptionList.Item label="Actions">
          {element.actions.length > 0 ? element.actions.join(', ') : '—'}
        </DescriptionList.Item>
        <DescriptionList.Item label="Live region">{element.liveRegion ?? '—'}</DescriptionList.Item>
        <DescriptionList.Item label="State">
          {element.states.length > 0 ? element.states.join(', ') : '—'}
        </DescriptionList.Item>
        <DescriptionList.Item label="Interactive">
          {element.interactive ? 'Yes' : 'No'}
        </DescriptionList.Item>
        <DescriptionList.Item label="Size">
          {frame ? (
            <span className="font-mono text-xs">
              {formatNumber(frame.width)} × {formatNumber(frame.height)}
              {element.interactive && (
                <span className="text-faint">
                  {' '}
                  (minimum {minTouchTarget} × {minTouchTarget})
                </span>
              )}
            </span>
          ) : (
            '—'
          )}
        </DescriptionList.Item>
        <DescriptionList.Item label="Position">
          {frame ? (
            <span className="font-mono text-xs">
              {formatNumber(frame.x)}, {formatNumber(frame.y)}
            </span>
          ) : (
            '—'
          )}
        </DescriptionList.Item>
        <DescriptionList.Item label="Host">
          <span className="font-mono text-xs">{element.hostType}</span>
        </DescriptionList.Item>
        <DescriptionList.Item label="Component">
          <span className="font-mono text-xs break-words">
            {element.componentPath.length > 0 ? element.componentPath.join(' › ') : '—'}
          </span>
        </DescriptionList.Item>
      </DescriptionList>
    </div>
  );
}

function SystemState({ audit }: { audit: AccessibilityAudit }) {
  const flags: [keyof AccessibilitySystemState, string][] = [
    ['screenReaderEnabled', 'Screen reader'],
    ['reduceMotionEnabled', 'Reduce motion'],
    ['boldTextEnabled', 'Bold text'],
    ['grayscaleEnabled', 'Grayscale'],
    ['invertColorsEnabled', 'Invert colors'],
    ['reduceTransparencyEnabled', 'Reduce transparency'],
  ];
  const active = flags.filter(([key]) => audit.system[key] === true);

  return (
    <footer className="flex shrink-0 flex-wrap items-center gap-1.5 border-t border-border bg-card px-3 py-2">
      <Badge tone="neutral" variant="soft">
        {audit.platform}
      </Badge>
      <Badge tone={audit.system.fontScale === 1 ? 'neutral' : 'info'} variant="soft">
        Font scale {formatNumber(audit.system.fontScale)}
      </Badge>
      {active.map(([key, label]) => (
        <Badge key={key} tone="info" variant="soft">
          {label}
        </Badge>
      ))}
      <span className="ml-auto text-xs text-muted-foreground">
        Audited at {new Date(audit.takenAt).toLocaleTimeString()}
      </span>
    </footer>
  );
}

function AccessibilityPanelContent() {
  const { connected, audit, isRunning, error, run, highlight } = useAccessibilityAudit();
  const [filter, setFilter] = useState<ElementFilter>('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Element ids are only meaningful within the audit that produced them.
  useEffect(() => {
    setSelectedId(null);
  }, [audit]);

  useEffect(() => {
    highlight(selectedId);
  }, [highlight, selectedId]);

  useEffect(() => () => highlight(null), [highlight]);

  const elements = useMemo(() => audit?.elements ?? [], [audit]);
  const counts = useMemo(() => countIssues(elements), [elements]);
  const visibleElements = useMemo(
    () => filterElements(elements, filter, search),
    [elements, filter, search],
  );
  const selectedElement = elements.find((element) => element.id === selectedId) ?? null;

  return (
    <PluginShell.Body>
      <div className="flex h-full min-h-0 flex-col">
        <Toolbar>
          <Toolbar.Group>
            <Toolbar.Button onClick={() => void run()} disabled={!connected || isRunning}>
              <RefreshCw />
              {isRunning ? 'Auditing…' : 'Run audit'}
            </Toolbar.Button>
          </Toolbar.Group>
          <Toolbar.Separator />
          <ToggleGroup
            size="sm"
            value={[filter]}
            onValueChange={(next) => {
              const value = next[0];
              if (value === 'all' || value === 'issues') setFilter(value);
            }}
          >
            <ToggleGroup.Item size="sm" value="all">
              All {elements.length}
            </ToggleGroup.Item>
            <ToggleGroup.Item size="sm" value="issues">
              Issues {counts.errors + counts.warnings}
            </ToggleGroup.Item>
          </ToggleGroup>
          <div className="min-w-40 flex-1">
            <SearchField
              placeholder="Search elements…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onClear={() => setSearch('')}
            />
          </div>
          {audit && (
            <div className="flex items-center gap-1.5">
              <Badge tone={counts.errors > 0 ? 'danger' : 'neutral'} variant="soft">
                {counts.errors} {counts.errors === 1 ? 'error' : 'errors'}
              </Badge>
              <Badge tone={counts.warnings > 0 ? 'warning' : 'neutral'} variant="soft">
                {counts.warnings} {counts.warnings === 1 ? 'warning' : 'warnings'}
              </Badge>
            </div>
          )}
        </Toolbar>

        {error && (
          <Alert tone="danger" className="shrink-0">
            <Alert.Title>Audit failed</Alert.Title>
            <Alert.Description>{error}</Alert.Description>
          </Alert>
        )}

        <div className="min-h-0 flex-1">
          {!audit ? (
            <EmptyState
              icon={Info}
              title={connected ? 'No audit yet' : 'Waiting for the app'}
              description={
                <>
                  Render <code className="text-foreground">{'<RozeniteAccessibility />'}</code> in
                  your app, then run an audit of the screen it is showing.
                </>
              }
            />
          ) : (
            <Split direction="horizontal" autoSaveId="accessibility">
              <Split.Pane defaultSize={55} minSize={30}>
                <div className="h-full overflow-auto">
                  {visibleElements.length === 0 ? (
                    <EmptyState
                      icon={filter === 'issues' && !search ? CheckCircle2 : AlertTriangle}
                      title={
                        filter === 'issues' && !search ? 'No issues found' : 'No matching elements'
                      }
                      description={
                        filter === 'issues' && !search
                          ? 'Nothing on this screen broke a rule. Rules cover labels, roles, touch targets and nesting, not contrast or focus order.'
                          : 'Try a different search or filter.'
                      }
                    />
                  ) : (
                    <List className="gap-0">
                      {visibleElements.map((element) => (
                        <ElementRow
                          key={element.id}
                          element={element}
                          selected={element.id === selectedId}
                          onSelect={() =>
                            setSelectedId((current) => (current === element.id ? null : element.id))
                          }
                        />
                      ))}
                    </List>
                  )}
                </div>
              </Split.Pane>
              <Split.Handle />
              <Split.Pane>
                <div className="h-full overflow-auto">
                  {selectedElement ? (
                    <ElementDetails
                      element={selectedElement}
                      minTouchTarget={audit.minTouchTarget}
                    />
                  ) : (
                    <EmptyState
                      icon={Info}
                      title="No element selected"
                      description="Select an element to see what a screen reader announces for it. The element is outlined in the app."
                    />
                  )}
                </div>
              </Split.Pane>
            </Split>
          )}
        </div>

        {audit && <SystemState audit={audit} />}
      </div>
    </PluginShell.Body>
  );
}

export default function AccessibilityPanel() {
  return (
    <PluginShell>
      <AccessibilityPanelContent />
    </PluginShell>
  );
}
