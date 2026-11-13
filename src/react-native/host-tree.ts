import type { Frame } from '../shared/types';
import { asObject } from './values';

/**
 * The slice of a React fiber this plugin reads. Fibers are React internals,
 * so everything is read defensively and nothing is ever written.
 */
export type FiberLike = {
  tag: number;
  type?: unknown;
  memoizedProps?: unknown;
  memoizedState?: unknown;
  stateNode?: unknown;
  child?: FiberLike | null;
  sibling?: FiberLike | null;
  /** Development only: the component whose render created this element. */
  _debugOwner?: unknown;
};

export const TEXT_NODE_TYPE = '#text';

export type HostNode = {
  /** Host component name (`RCTView`), or `#text` for a text node. */
  type: string;
  props: Record<string, unknown>;
  text?: string;
  children: HostNode[];
  /** Composite components above this node, outermost first. */
  componentPath: string[];
  /** Components that rendered this node, nearest first. Empty outside development. */
  ownerPath: string[];
  measure: () => Frame | null;
};

// React's work tags. Stable across React 18 and 19.
const FUNCTION_COMPONENT = 0;
const CLASS_COMPONENT = 1;
const HOST_COMPONENT = 5;
const HOST_TEXT = 6;
const FORWARD_REF = 11;
const MEMO_COMPONENT = 14;
const SIMPLE_MEMO_COMPONENT = 15;
const OFFSCREEN_COMPONENT = 22;

const MAX_COMPONENT_PATH = 8;
const MAX_OWNER_PATH = 12;

// Development-only UI React Native and this plugin mount inside the app's own
// root. It is not part of the app, so auditing it would only add noise.
const IGNORED_COMPONENTS = new Set([
  'DebuggingOverlay',
  'LogBoxStateSubscription',
  'ReactDevToolsOverlay',
  'ReactDevToolsOverlayDeferred',
  'RozeniteAccessibility',
]);

const asName = (value: unknown): string | null =>
  typeof value === 'string' && value ? value : null;

const getName = (value: unknown): string | null => {
  if (typeof value === 'function') {
    return asName('displayName' in value ? value.displayName : null) ?? asName(value.name);
  }
  if (!value || typeof value !== 'object') {
    return null;
  }
  const wrapper = asObject(value);
  return asName(wrapper.displayName) ?? getName(wrapper.render) ?? getName(wrapper.type);
};

const getComponentName = (fiber: FiberLike): string | null => {
  switch (fiber.tag) {
    case FUNCTION_COMPONENT:
    case CLASS_COMPONENT:
    case FORWARD_REF:
    case MEMO_COMPONENT:
    case SIMPLE_MEMO_COMPONENT:
      return getName(fiber.type);
    default:
      return null;
  }
};

const getOwnerPath = (fiber: FiberLike): string[] => {
  const names: string[] = [];
  let owner = fiber._debugOwner;
  for (let depth = 0; owner && depth < MAX_OWNER_PATH; depth += 1) {
    const { tag, type, name: ownName, _debugOwner } = asObject(owner);
    // Server components are described by a plain `{ name }` instead of a fiber.
    const name =
      typeof tag === 'number'
        ? getComponentName({ tag, type })
        : typeof ownName === 'string'
          ? ownName
          : null;
    if (name) {
      names.push(name);
    }
    owner = _debugOwner;
  }
  return names;
};

const noFrame = () => null;

const textNode = (text: string, componentPath: string[]): HostNode => ({
  type: TEXT_NODE_TYPE,
  props: {},
  text,
  children: [],
  componentPath,
  ownerPath: [],
  measure: noFrame,
});

const walk = (
  first: FiberLike | null | undefined,
  path: string[],
  out: HostNode[],
  measure: (stateNode: unknown) => Frame | null,
) => {
  for (let fiber = first; fiber; fiber = fiber.sibling) {
    // A hidden <Activity> or a suspended subtree stays mounted but is not shown.
    if (fiber.tag === OFFSCREEN_COMPONENT && fiber.memoizedState != null) {
      continue;
    }

    if (fiber.tag === HOST_TEXT) {
      out.push(textNode(String(fiber.memoizedProps ?? ''), path));
      continue;
    }

    if (fiber.tag === HOST_COMPONENT) {
      const props = asObject(fiber.memoizedProps);
      const stateNode = fiber.stateNode;
      const node: HostNode = {
        type: typeof fiber.type === 'string' ? fiber.type : 'Unknown',
        props,
        children: [],
        componentPath: path.slice(-MAX_COMPONENT_PATH),
        ownerPath: getOwnerPath(fiber),
        measure: () => measure(stateNode),
      };

      walk(fiber.child, path, node.children, measure);
      out.push(node);
      continue;
    }

    const name = getComponentName(fiber);
    if (name && IGNORED_COMPONENTS.has(name)) {
      continue;
    }

    walk(fiber.child, name ? [...path, name] : path, out, measure);
  }
};

/** Reduces fiber trees to their host elements, keeping the component names above each. */
export const collectHostNodes = (
  roots: FiberLike[],
  measure: (stateNode: unknown) => Frame | null,
): HostNode[] => {
  const out: HostNode[] = [];
  for (const root of roots) {
    walk(root.child, [], out, measure);
  }
  return out;
};
