import type { Frame } from '../shared/types';

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
const HOST_HOISTABLE = 26;
const HOST_SINGLETON = 27;

const MAX_COMPONENT_PATH = 8;
const MAX_OWNER_PATH = 12;

// Development-only UI React Native and this plugin mount inside the app's own
// root. It is not part of the app, so auditing it would only add noise.
const IGNORED_COMPONENT = /^(LogBox|DebuggingOverlay|ReactDevToolsOverlay|RozeniteAccessibility)/;

const getName = (value: unknown): string | null => {
  if (typeof value === 'function') {
    const fn = value as { displayName?: string; name?: string };
    return fn.displayName || fn.name || null;
  }
  if (value && typeof value === 'object') {
    const wrapper = value as { displayName?: string; render?: unknown; type?: unknown };
    return wrapper.displayName || getName(wrapper.render) || getName(wrapper.type);
  }
  return null;
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
  let owner = fiber._debugOwner as (FiberLike & { name?: unknown }) | null | undefined;
  for (let depth = 0; owner && depth < MAX_OWNER_PATH; depth += 1) {
    // Server components are described by a plain `{ name }` instead of a fiber.
    const name =
      typeof owner.tag === 'number'
        ? getComponentName(owner)
        : typeof owner.name === 'string'
          ? owner.name
          : null;
    if (name) {
      names.push(name);
    }
    owner = owner._debugOwner as typeof owner;
  }
  return names;
};

const noFrame = () => null;

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
      out.push({
        type: TEXT_NODE_TYPE,
        props: {},
        text: String(fiber.memoizedProps ?? ''),
        children: [],
        componentPath: path,
        ownerPath: [],
        measure: noFrame,
      });
      continue;
    }

    if (
      fiber.tag === HOST_COMPONENT ||
      fiber.tag === HOST_HOISTABLE ||
      fiber.tag === HOST_SINGLETON
    ) {
      const props = (fiber.memoizedProps ?? {}) as Record<string, unknown>;
      const stateNode = fiber.stateNode;
      const node: HostNode = {
        type: typeof fiber.type === 'string' ? fiber.type : 'Unknown',
        props,
        children: [],
        componentPath: path.slice(-MAX_COMPONENT_PATH),
        ownerPath: getOwnerPath(fiber),
        measure: () => measure(stateNode),
      };

      // React DOM keeps a lone string child in props instead of a text fiber.
      if (
        !fiber.child &&
        (typeof props.children === 'string' || typeof props.children === 'number')
      ) {
        node.children.push({
          type: TEXT_NODE_TYPE,
          props: {},
          text: String(props.children),
          children: [],
          componentPath: path,
          ownerPath: [],
          measure: noFrame,
        });
      }

      walk(fiber.child, path, node.children, measure);
      out.push(node);
      continue;
    }

    const name = getComponentName(fiber);
    if (name && IGNORED_COMPONENT.test(name)) {
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
