import { describe, expect, it } from 'vitest';
import { collectHostNodes, TEXT_NODE_TYPE, type FiberLike } from '../host-tree';

const FUNCTION = 0;
const HOST = 5;
const TEXT = 6;
const FORWARD_REF = 11;
const OFFSCREEN = 22;

/** Links children into the `child`/`sibling` chain React uses. */
const fiber = (
  tag: number,
  type: unknown,
  props: unknown = {},
  children: FiberLike[] = [],
  extra: Partial<FiberLike> = {},
): FiberLike => {
  children.forEach((child, index) => {
    child.sibling = children[index + 1] ?? null;
  });
  return { tag, type, memoizedProps: props, child: children[0] ?? null, sibling: null, ...extra };
};

const component = (name: string, children: FiberLike[]) =>
  fiber(
    FUNCTION,
    Object.assign(() => null, { displayName: name }),
    {},
    children,
  );

const host = (type: string, props: unknown = {}, children: FiberLike[] = []) =>
  fiber(HOST, type, props, children);

const root = (children: FiberLike[]) => fiber(3, null, null, children);

const noMeasure = () => null;

describe('collectHostNodes', () => {
  it('keeps host elements and text, dropping the components between them', () => {
    const tree = root([
      component('App', [
        host('RCTView', { testID: 'card' }, [
          component('Title', [host('RCTText', {}, [fiber(TEXT, null, 'Hello')])]),
        ]),
      ]),
    ]);

    const [view] = collectHostNodes([tree], noMeasure);

    expect(view).toMatchObject({
      type: 'RCTView',
      props: { testID: 'card' },
      componentPath: ['App'],
    });
    expect(view.children[0]).toMatchObject({ type: 'RCTText', componentPath: ['App', 'Title'] });
    expect(view.children[0].children[0]).toMatchObject({ type: TEXT_NODE_TYPE, text: 'Hello' });
  });

  it('names forwardRef and memo components', () => {
    const forwardRef = fiber(FORWARD_REF, { render: function Pressable() {} }, {}, [
      host('RCTView'),
    ]);
    const memo = fiber(14, { type: function Row() {} }, {}, [forwardRef]);

    const [view] = collectHostNodes([root([memo])], noMeasure);

    expect(view.componentPath).toEqual(['Row', 'Pressable']);
  });

  it('skips a hidden Offscreen subtree but keeps a visible one', () => {
    const hidden = fiber(OFFSCREEN, null, {}, [host('RCTView', { testID: 'hidden' })], {
      memoizedState: {},
    });
    const visible = fiber(OFFSCREEN, null, {}, [host('RCTView', { testID: 'visible' })]);

    const nodes = collectHostNodes([root([hidden, visible])], noMeasure);

    expect(nodes.map((node) => node.props.testID)).toEqual(['visible']);
  });

  it('skips development overlays mounted in the app root', () => {
    const tree = root([
      component('LogBoxNotificationContainer', [host('RCTView', { testID: 'logbox' })]),
      component('RozeniteAccessibility', [host('RCTView', { testID: 'outline' })]),
      component('App', [host('RCTView', { testID: 'app' })]),
    ]);

    expect(collectHostNodes([tree], noMeasure).map((node) => node.props.testID)).toEqual(['app']);
  });

  it('turns a lone string child, as React DOM stores it, into a text node', () => {
    const [button] = collectHostNodes([root([host('button', { children: 'Save' })])], noMeasure);

    expect(button.children).toEqual([
      expect.objectContaining({ type: TEXT_NODE_TYPE, text: 'Save' }),
    ]);
  });

  it('does not repeat text that React Native keeps both in props and as a text fiber', () => {
    const tree = root([host('RCTText', { children: 'Save' }, [fiber(TEXT, null, 'Save')])]);

    expect(collectHostNodes([tree], noMeasure)[0].children).toHaveLength(1);
  });

  it('records the components that rendered an element, nearest first', () => {
    const screen = component('CheckoutScreen', []);
    const pressable = fiber(FORWARD_REF, { render: function Pressable() {} }, {}, [], {
      _debugOwner: screen,
    });
    const view = fiber(HOST, 'RCTView', {}, [], { _debugOwner: pressable });

    expect(collectHostNodes([root([view])], noMeasure)[0].ownerPath).toEqual([
      'Pressable',
      'CheckoutScreen',
    ]);
  });

  it('measures through the host instance of each element', () => {
    const instance = { id: 'instance' };
    const tree = root([fiber(HOST, 'RCTView', {}, [], { stateNode: instance })]);
    const frame = { x: 1, y: 2, width: 3, height: 4 };

    const [view] = collectHostNodes([tree], (stateNode) => (stateNode === instance ? frame : null));

    expect(view.measure()).toEqual(frame);
  });
});
