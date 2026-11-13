import { describe, expect, it } from 'vitest';
import type { Frame, Platform } from '../../shared/types';
import { auditHostTree } from '../audit';
import { TEXT_NODE_TYPE, type HostNode } from '../host-tree';

const LARGE: Frame = { x: 0, y: 0, width: 200, height: 48 };
const SMALL: Frame = { x: 0, y: 0, width: 24, height: 24 };

const node = (
  type: string,
  props: Record<string, unknown> = {},
  children: HostNode[] = [],
  frame: Frame | null = LARGE,
): HostNode => ({
  type,
  props,
  children,
  componentPath: [],
  ownerPath: [],
  measure: () => frame,
});

const text = (value: string): HostNode => ({
  type: TEXT_NODE_TYPE,
  props: {},
  text: value,
  children: [],
  componentPath: [],
  ownerPath: [],
  measure: () => null,
});

const label = (value: string) => node('RCTText', { accessible: true }, [text(value)]);

// What React Native's Pressable hands to its host view.
const pressable = (
  props: Record<string, unknown> = {},
  children: HostNode[] = [],
  frame: Frame | null = LARGE,
) => node('RCTView', { accessible: true, onClick: () => undefined, ...props }, children, frame);

const audit = (roots: HostNode[], platform: Platform = 'ios') =>
  auditHostTree(roots, platform).elements;

const rules = (roots: HostNode[], platform: Platform = 'ios') =>
  audit(roots, platform).flatMap((element) => element.issues.map((issue) => issue.rule));

describe('auditHostTree', () => {
  it('names a control after its text and announces the role', () => {
    const [button, ...rest] = audit([pressable({ role: 'button' }, [label('Save')])]);

    expect(rest).toEqual([]);
    expect(button).toMatchObject({
      label: 'Save',
      role: 'button',
      announcement: 'Save, button',
      interactive: true,
      focusable: true,
      issues: [],
    });
  });

  it('prefers an explicit label over the text inside', () => {
    const [button] = audit([
      pressable({ accessibilityRole: 'button', accessibilityLabel: 'Close dialog' }, [label('×')]),
    ]);

    expect(button.announcement).toBe('Close dialog, button');
  });

  it('flags a control with neither a label nor text', () => {
    const elements = audit([pressable({ role: 'button' }, [node('RCTImageView')])]);

    expect(elements).toHaveLength(1);
    expect(elements[0].issues).toEqual([
      expect.objectContaining({ rule: 'missing-label', severity: 'error' }),
    ]);
  });

  it('flags a control without a role', () => {
    expect(rules([pressable({}, [label('Save')])])).toEqual(['missing-role']);
  });

  it('includes state in the announcement', () => {
    const [checkbox] = audit([
      pressable({ role: 'checkbox', accessibilityState: { checked: true, disabled: true } }, [
        label('Terms'),
      ]),
    ]);

    expect(checkbox.announcement).toBe('Terms, checkbox, disabled, checked');
  });

  describe('touch targets', () => {
    const small: Frame = { x: 0, y: 0, width: 46, height: 46 };
    const button = (props: Record<string, unknown> = {}) =>
      pressable({ role: 'button', ...props }, [label('OK')], small);

    it('uses 44pt on iOS and 48dp on Android', () => {
      expect(rules([button()], 'ios')).toEqual([]);
      expect(rules([button()], 'android')).toEqual(['small-touch-target']);
    });

    it('counts hitSlop towards the target', () => {
      expect(rules([button({ hitSlop: 4 })], 'android')).toEqual([]);
      expect(rules([button({ hitSlop: { top: 4, bottom: 4 } })], 'android')).toEqual([
        'small-touch-target',
      ]);
    });

    it('skips elements that could not be measured', () => {
      expect(rules([pressable({ role: 'button' }, [label('OK')], null)], 'android')).toEqual([]);
    });
  });

  describe('text inputs', () => {
    it('warns when the placeholder is the only description', () => {
      const [input] = audit([node('RCTSinglelineTextInputView', { placeholder: 'Email' })]);

      expect(input.announcement).toBe('Email, text field');
      expect(input.issues).toEqual([
        expect.objectContaining({ rule: 'input-missing-label', severity: 'warning' }),
      ]);
    });

    it('reports an error when there is no description at all', () => {
      const [input] = audit([node('AndroidTextInput')], 'android');

      expect(input.issues).toEqual([
        expect.objectContaining({ rule: 'input-missing-label', severity: 'error' }),
      ]);
    });

    it('accepts a label', () => {
      expect(rules([node('RCTSinglelineTextInputView', { accessibilityLabel: 'Email' })])).toEqual(
        [],
      );
    });
  });

  describe('nesting', () => {
    const card = () =>
      pressable({ role: 'button' }, [
        label('Order 42'),
        pressable({ role: 'button' }, [label('Delete')]),
      ]);

    it('flags a control inside another accessible element', () => {
      const elements = audit([card()]);

      expect(elements.map((element) => element.label)).toEqual(['Order 42 Delete', 'Delete']);
      expect(elements[1]).toMatchObject({
        focusable: false,
        issues: [expect.objectContaining({ rule: 'nested-interactive', severity: 'error' })],
      });
    });

    it('is a warning on Android, where TalkBack focuses the control on its own', () => {
      const nested = audit([card()], 'android')[1];

      expect(nested.focusable).toBe(true);
      expect(nested.issues[0].severity).toBe('warning');
    });

    it('does not list plain text folded into its parent', () => {
      expect(audit([pressable({ role: 'button' }, [label('Save')])])).toHaveLength(1);
    });

    it('leaves links inside a paragraph alone', () => {
      const paragraph = node('RCTText', { accessible: true }, [
        text('Read the '),
        node('RCTVirtualText', { isPressable: true }, [text('terms')]),
      ]);

      expect(rules([paragraph])).toEqual([]);
    });
  });

  describe('images', () => {
    it('warns about an image with no label that is not marked decorative', () => {
      expect(rules([node('RCTImageView')])).toEqual(['image-missing-label']);
    });

    it('accepts a decorative image and one with alt text', () => {
      expect(rules([node('RCTImageView', { accessible: false })])).toEqual([]);

      const [image] = audit([
        node('RCTImageView', { accessible: true, accessibilityLabel: 'Team photo' }),
      ]);
      expect(image).toMatchObject({ announcement: 'Team photo, image', issues: [] });
    });
  });

  describe('hidden content', () => {
    const button = () => pressable({}, [node('RCTImageView')]);

    it.each([
      ['aria-hidden', { 'aria-hidden': true }],
      ['display: none', { style: [{ flex: 1 }, { display: 'none' }] }],
    ])('skips a subtree hidden with %s', (_name, props) => {
      expect(audit([node('RCTView', props, [button()])])).toEqual([]);
      expect(audit([node('RCTView', props, [button()])], 'android')).toEqual([]);
    });

    it('honours the hiding props only on the platform they work on', () => {
      const iosOnly = node('RCTView', { accessibilityElementsHidden: true }, [button()]);
      const androidOnly = node('RCTView', { importantForAccessibility: 'no-hide-descendants' }, [
        button(),
      ]);

      expect(audit([iosOnly], 'ios')).toEqual([]);
      expect(audit([iosOnly], 'android')).toHaveLength(1);
      expect(audit([androidOnly], 'android')).toEqual([]);
      expect(audit([androidOnly], 'ios')).toHaveLength(1);
    });

    it('audits only the top screen of a native stack', () => {
      const screen = (title: string) => node('RNSScreen', {}, [label(title)]);
      const stack = node('RNSScreenStack', {}, [screen('Home'), screen('Details')]);

      expect(audit([stack]).map((element) => element.label)).toEqual(['Details']);
    });

    it('skips an inactive screen', () => {
      const tabs = node('RNSScreenContainer', {}, [
        node('RNSScreen', { activityState: 0 }, [label('Feed')]),
        node('RNSScreen', { activityState: 2 }, [label('Profile')]),
      ]);

      expect(audit([tabs]).map((element) => element.label)).toEqual(['Profile']);
    });
  });

  describe('roles', () => {
    it('flags a role React Native does not know', () => {
      expect(rules([pressable({ role: 'buton' }, [label('Save')])])).toEqual(['invalid-role']);
    });

    it('flags an ARIA role passed as accessibilityRole and points at the role prop', () => {
      const [title] = audit([node('RCTText', { accessibilityRole: 'heading' }, [text('Title')])]);

      expect(title.issues).toEqual([
        expect.objectContaining({
          rule: 'invalid-role',
          severity: 'error',
          message: expect.stringContaining('role="heading"'),
        }),
      ]);
      expect(title.announcement).toBe('Title');
    });

    it('accepts values of either prop', () => {
      expect(rules([pressable({ accessibilityRole: 'imagebutton' }, [label('Save')])])).toEqual([]);
      expect(rules([node('RCTText', { role: 'heading' }, [text('Title')])])).toEqual([]);
    });

    it('expects a checkable control to say whether it is checked', () => {
      const checkbox = (props: Record<string, unknown>) =>
        pressable({ role: 'checkbox', ...props }, [label('Terms')]);

      expect(rules([checkbox({})])).toEqual(['missing-state']);
      expect(rules([checkbox({ 'aria-checked': false })])).toEqual([]);
      expect(rules([checkbox({ accessibilityState: { checked: 'mixed' } })])).toEqual([]);
    });

    it('lets a radio report selected instead of checked', () => {
      expect(
        rules([pressable({ role: 'radio', accessibilityState: { selected: true } }, [label('A')])]),
      ).toEqual([]);
    });

    it('expects an adjustable control to announce its value', () => {
      const slider = (props: Record<string, unknown>) =>
        node('RCTView', {
          accessible: true,
          role: 'slider',
          accessibilityLabel: 'Volume',
          accessibilityActions: [{ name: 'increment' }, { name: 'decrement' }],
          onAccessibilityAction: () => undefined,
          ...props,
        });

      expect(rules([slider({})])).toEqual(['missing-value']);

      const [withText] = audit([slider({ accessibilityValue: { text: '40 percent' } })]);
      expect(withText).toMatchObject({
        value: '40 percent',
        announcement: 'Volume, 40 percent, slider',
        issues: [],
      });

      expect(audit([slider({ 'aria-valuenow': 4 })])[0].value).toBe('4');
    });
  });

  describe('accessibility actions', () => {
    const actions = [{ name: 'activate' }, { name: 'delete', label: 'Delete' }];

    it('lists the actions and flags ones nothing handles', () => {
      const [element] = audit([
        pressable({ role: 'button', accessibilityLabel: 'Mail', accessibilityActions: actions }),
      ]);

      expect(element.actions).toEqual(['activate', 'delete']);
      expect(element.issues).toEqual([
        expect.objectContaining({ rule: 'unhandled-actions', severity: 'error' }),
      ]);
    });

    it('flags a handler with no actions to call it', () => {
      expect(
        rules([
          pressable({
            role: 'button',
            accessibilityLabel: 'Mail',
            onAccessibilityAction: () => undefined,
          }),
        ]),
      ).toEqual(['unhandled-actions']);
    });

    it('accepts actions with a handler', () => {
      expect(
        rules([
          pressable({
            role: 'button',
            accessibilityLabel: 'Mail',
            accessibilityActions: actions,
            onAccessibilityAction: () => undefined,
          }),
        ]),
      ).toEqual([]);
    });

    it('expects an adjustable element to handle increment and decrement', () => {
      const slider = (names: string[]) =>
        node('RCTView', {
          accessible: true,
          accessibilityRole: 'adjustable',
          accessibilityLabel: 'Volume',
          accessibilityValue: { now: 4 },
          accessibilityActions: names.map((name) => ({ name })),
          onAccessibilityAction: () => undefined,
        });

      expect(rules([slider(['activate'])])).toEqual(['unhandled-actions']);
      expect(rules([slider(['increment', 'decrement'])])).toEqual([]);
    });

    it('treats role="slider" as adjustable', () => {
      expect(
        rules([
          node('RCTView', {
            accessible: true,
            role: 'slider',
            accessibilityLabel: 'Volume',
            'aria-valuenow': 4,
          }),
        ]),
      ).toEqual(['unhandled-actions']);
    });

    it('reports both an unhandled action and missing increment on one element', () => {
      const [element] = audit([
        node('RCTView', {
          accessible: true,
          accessibilityRole: 'adjustable',
          accessibilityLabel: 'Volume',
          accessibilityValue: { now: 4 },
          onAccessibilityAction: () => undefined,
        }),
      ]);
      expect(element.issues.map((issue) => issue.rule)).toEqual([
        'unhandled-actions',
        'unhandled-actions',
      ]);
    });
  });

  describe('disabled state', () => {
    it('flags a control that ignores touches but is announced as usable', () => {
      expect(rules([pressable({ role: 'button', pointerEvents: 'none' }, [label('Pay')])])).toEqual(
        ['missing-disabled-state'],
      );
      expect(
        rules([pressable({ role: 'button', style: { pointerEvents: 'none' } }, [label('Pay')])]),
      ).toEqual(['missing-disabled-state']);
    });

    it('follows pointerEvents of ancestors and the meaning of box-none and box-only', () => {
      const button = (props: Record<string, unknown> = {}) =>
        pressable({ role: 'button', ...props }, [label('Pay')]);

      expect(rules([node('RCTView', { pointerEvents: 'none' }, [button()])])).toEqual([
        'missing-disabled-state',
      ]);
      expect(rules([node('RCTView', { pointerEvents: 'box-only' }, [button()])])).toEqual([
        'missing-disabled-state',
      ]);
      expect(rules([node('RCTView', { pointerEvents: 'box-none' }, [button()])])).toEqual([]);
      expect(rules([button({ pointerEvents: 'box-only' })])).toEqual([]);
      expect(rules([button({ pointerEvents: 'box-none' })])).toEqual([]);
    });

    it('accepts it when the control is marked disabled', () => {
      expect(
        rules([
          pressable({ role: 'button', pointerEvents: 'none', 'aria-disabled': true }, [
            label('Pay'),
          ]),
        ]),
      ).toEqual([]);
    });
  });

  it('reports a live region on Android only', () => {
    const live = node('RCTText', { accessible: true, accessibilityLiveRegion: 'polite' }, [
      text('Saved'),
    ]);

    expect(audit([live], 'android')[0].liveRegion).toBe('polite');
    expect(audit([live], 'ios')[0].liveRegion).toBeNull();
    const off = node('RCTText', { accessible: true, accessibilityLiveRegion: 'none' }, [
      text('Idle'),
    ]);
    expect(audit([off], 'android')[0].liveRegion).toBeNull();
    // Text passes aria-live on without turning it into a live region.
    const aria = node('RCTText', { accessible: true, 'aria-live': 'polite' }, [text('Saved')]);
    expect(audit([aria], 'android')[0].liveRegion).toBeNull();
  });

  describe('font scaling', () => {
    it('flags text that ignores the system font size', () => {
      expect(rules([node('RCTText', { allowFontScaling: false }, [text('Total')])])).toEqual([
        'font-scaling-disabled',
      ]);
      expect(rules([node('RCTText', { maxFontSizeMultiplier: 1 }, [text('Total')])])).toEqual([
        'font-scaling-disabled',
      ]);
      expect(rules([node('RCTText', { maxFontSizeMultiplier: 1.5 }, [text('Total')])])).toEqual([]);
    });

    it('reports it for text folded into a control too', () => {
      const elements = audit([
        pressable({ role: 'button' }, [
          node('RCTText', { allowFontScaling: false }, [text('Save')]),
        ]),
      ]);

      expect(elements.map((element) => element.issues.map((issue) => issue.rule))).toEqual([
        [],
        ['font-scaling-disabled'],
      ]);
      expect(elements[1].focusable).toBe(false);
    });
  });

  it('audits only a modal view, not the siblings it covers', () => {
    const screen = node('RCTView', {}, [
      label('Behind'),
      node('RCTView', { accessibilityViewIsModal: true }, [label('Dialog')]),
    ]);

    expect(audit([screen]).map((element) => element.label)).toEqual(['Dialog']);
  });

  it('words the announcement the way TalkBack does on Android', () => {
    const checkbox = pressable({ role: 'checkbox', 'aria-checked': false }, [label('Terms')]);
    const slider = node('RCTView', {
      accessible: true,
      role: 'slider',
      accessibilityLabel: 'Volume',
      accessibilityValue: { now: 4 },
    });
    const input = node('AndroidTextInput', { accessibilityLabel: 'Email' });

    expect(audit([checkbox, slider, input], 'android').map((e) => e.announcement)).toEqual([
      'not checked, Terms, check box',
      '4, Volume, slider',
      'Email, edit box',
    ]);
  });

  it('announces the position of a native switch', () => {
    expect(audit([node('AndroidSwitch', { on: false })], 'android')[0].announcement).toBe(
      'off, switch',
    );
    expect(audit([node('RCTSwitch', { value: true })], 'ios')[0].announcement).toBe('switch, on');
  });

  it('warns about a control that opted out of accessibility', () => {
    expect(rules([pressable({ accessible: false, role: 'button' }, [label('Save')])])).toEqual([
      'not-accessible',
    ]);
  });

  it('treats plain text as readable on Android, where it is not reported as accessible', () => {
    const plain = node('RCTText', { accessible: false }, [text('Hello')]);

    expect(audit([plain], 'android').map((element) => element.label)).toEqual(['Hello']);
    expect(audit([plain], 'ios')).toEqual([]);
  });

  it('names the nearest app component, not the framework ones around the host', () => {
    const button: HostNode = {
      ...pressable({ role: 'button' }, [label('Save')]),
      componentPath: ['App', 'ThemeProvider', 'SaveButton', 'Pressable', 'View'],
    };

    expect(audit([button])[0].component).toBe('SaveButton');
  });

  it('prefers the component that rendered the element over a wrapper it was passed to', () => {
    const button: HostNode = {
      ...pressable({ role: 'button' }, [label('Save')]),
      componentPath: ['CheckoutScreen', 'Card', 'Pressable', 'View'],
      ownerPath: ['Pressable', 'CheckoutScreen'],
    };

    expect(audit([button])[0].component).toBe('CheckoutScreen');
  });

  it('lets an element be measured again by id', () => {
    const frame: Frame = { x: 10, y: 20, width: 100, height: 50 };
    const result = auditHostTree([pressable({ role: 'button' }, [label('Save')], frame)], 'ios');

    expect(result.measureById.get(result.elements[0].id)?.()).toEqual(frame);
  });

  describe('review fixes', () => {
    it('leaves native sliders to handle increment and decrement themselves', () => {
      expect(
        rules([
          node('RNCSlider', {
            accessible: true,
            role: 'slider',
            accessibilityLabel: 'Volume',
            'aria-valuenow': 4,
          }),
        ]),
      ).toEqual([]);
    });

    it('ignores pixel rounding in touch target sizes', () => {
      const button = (height: number) =>
        pressable({ role: 'button' }, [label('Pay')], { x: 0, y: 0, width: 200, height });

      expect(rules([button(47.99993896484375)], 'android')).toEqual([]);
      expect(rules([button(47.9)], 'android')).toEqual(['small-touch-target']);
    });

    it('checks the touch target of a standalone text control', () => {
      expect(
        rules([
          node(
            'RCTText',
            { accessible: true, role: 'link', onPress: () => undefined },
            [text('Forgot password')],
            { x: 0, y: 0, width: 120, height: 17 },
          ),
        ]),
      ).toEqual(['small-touch-target']);
    });

    it('checks touch target and disabled state of a nested control', () => {
      const [, nested] = audit([
        pressable({ role: 'button' }, [
          label('Notifications'),
          node('RCTView', { pointerEvents: 'none' }, [
            pressable({ role: 'button', accessibilityLabel: 'Toggle' }, [], SMALL),
          ]),
        ]),
      ]);
      expect(nested.issues.map((issue) => issue.rule)).toEqual([
        'nested-interactive',
        'missing-disabled-state',
        'small-touch-target',
      ]);
    });

    it('flags text with font scaling disabled even when hidden from screen readers', () => {
      const [element] = audit([
        node('RCTView', { 'aria-hidden': true }, [
          node('RCTText', { allowFontScaling: false }, [text('Price')]),
        ]),
      ]);
      expect(element).toMatchObject({
        label: 'Price',
        focusable: false,
        issues: [expect.objectContaining({ rule: 'font-scaling-disabled' })],
      });
      expect(
        audit([
          node('RCTView', { 'aria-hidden': true, style: { display: 'none' } }, [
            node('RCTText', { allowFontScaling: false }, [text('Price')]),
          ]),
        ]),
      ).toEqual([]);
    });
  });

  describe('modals', () => {
    const button = (name: string) => pressable({ role: 'button' }, [label(name)]);
    const labels = (roots: HostNode[], platform: Platform = 'ios') =>
      audit(roots, platform).map((element) => element.label);

    it('hides the siblings of an aria-modal view on iOS only', () => {
      const tree = [
        node('RCTView', {}, [
          button('Behind'),
          node('RCTView', { 'aria-modal': true }, [button('Dialog')]),
        ]),
      ];
      expect(labels(tree, 'ios')).toEqual(['Dialog']);
      expect(labels(tree, 'android')).toEqual(['Behind', 'Dialog']);
    });

    it('still checks font scaling of text behind an aria-modal view', () => {
      const tree = [
        node('RCTView', {}, [
          node('RCTText', { allowFontScaling: false }, [text('Price')]),
          node('RCTView', { 'aria-modal': true }, [button('Dialog')]),
        ]),
      ];
      expect(audit(tree).map((element) => [element.label, element.focusable])).toEqual([
        ['Price', false],
        ['Dialog', true],
      ]);
    });

    it('audits only an open Modal and what shows through a transparent one', () => {
      const tree = (transparent: boolean) => [
        node('RCTView', {}, [
          button('Behind'),
          node('RCTText', { allowFontScaling: false }, [text('Price')]),
          node('RCTModalHostView', { transparent }, [button('Dialog')]),
        ]),
      ];
      expect(labels(tree(false))).toEqual(['Dialog']);
      expect(labels(tree(true))).toEqual(['Dialog', 'Price']);
    });
  });

  it('checks the role of a nested control', () => {
    const [, nested] = audit([
      pressable({ role: 'button' }, [
        label('Settings'),
        pressable({ role: 'checkbox' }, [label('Wi-Fi')]),
      ]),
    ]);
    expect(nested.issues.map((issue) => issue.rule)).toEqual([
      'nested-interactive',
      'missing-state',
    ]);
  });

  it('does not report font scaling on screens a stack covers', () => {
    const screen = (activityState: number, name: string) =>
      node('RNSScreen', { activityState }, [
        node('RCTText', { allowFontScaling: false }, [text(name)]),
      ]);
    const tree = [
      node('RCTView', { 'aria-hidden': true }, [
        node('RNSScreenStack', {}, [screen(2, 'Covered'), screen(2, 'Top')]),
      ]),
    ];
    expect(audit(tree).map((element) => element.label)).toEqual(['Top']);
  });
});
