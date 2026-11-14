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

// The props View hands to its host view for `aria-hidden`.
const HIDDEN = {
  accessibilityElementsHidden: true,
  importantForAccessibility: 'no-hide-descendants',
};

const REACT_NATIVE = { major: 0, minor: 88 };

const audit = (roots: HostNode[], platform: Platform = 'ios', reactNativeVersion = REACT_NATIVE) =>
  auditHostTree(roots, platform, reactNativeVersion).elements;

const rules = (roots: HostNode[], platform: Platform = 'ios', reactNativeVersion = REACT_NATIVE) =>
  audit(roots, platform, reactNativeVersion).flatMap((element) =>
    element.issues.map((issue) => issue.rule),
  );

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

  it('ignores a raw aria-label, which only reaches a host that does not convert it', () => {
    expect(rules([node('RCTSwitch', { value: true, 'aria-label': 'Wi-Fi' })])).toEqual([
      'missing-label',
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

    it('leaves the size of a native iOS switch alone', () => {
      const frame = { x: 0, y: 0, width: 51, height: 31 };
      const props = { accessibilityLabel: 'Wi-Fi', value: true, on: true };

      expect(rules([node('RCTSwitch', props, [], frame)], 'ios')).toEqual([]);
      expect(rules([node('AndroidSwitch', props, [], frame)], 'android')).toEqual([
        'small-touch-target',
      ]);
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

    it('counts a labelling view only on Android, and only when one is named', () => {
      const labelledBy = { accessibilityLabelledBy: ['emailLabel'] };

      expect(rules([node('RCTSinglelineTextInputView', labelledBy)], 'ios')).toEqual([
        'input-missing-label',
      ]);
      expect(rules([node('AndroidTextInput', labelledBy)], 'android')).toEqual([]);
      expect(rules([node('AndroidTextInput', { accessibilityLabelledBy: [] })], 'android')).toEqual(
        ['input-missing-label'],
      );
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

    it('expects a nested control to have a name and a role on Android', () => {
      const tree = [pressable({ role: 'button' }, [label('Order 42'), pressable()])];
      const nestedRules = (platform: Platform) =>
        audit(tree, platform)[1].issues.map((issue) => issue.rule);

      expect(nestedRules('android')).toEqual([
        'nested-interactive',
        'missing-label',
        'missing-role',
      ]);
      expect(nestedRules('ios')).toEqual(['nested-interactive']);
    });

    it('flags a nested control that opted out of accessibility', () => {
      const tree = [
        pressable({ role: 'button' }, [
          label('Card'),
          pressable({ role: 'button', accessible: false }, [label('Delete')], SMALL),
        ]),
      ];

      expect(audit(tree)[1]).toMatchObject({
        focusable: false,
        issues: [
          expect.objectContaining({ rule: 'not-accessible' }),
          expect.objectContaining({ rule: 'small-touch-target' }),
        ],
      });
    });

    it('does not count a nested control without accessible as a TalkBack stop', () => {
      const tree = [
        pressable({ role: 'button' }, [
          label('Card'),
          node('RCTView', { role: 'button', onClick: () => undefined }, [label('Delete')]),
        ]),
      ];

      expect(audit(tree, 'android')[1]).toMatchObject({
        focusable: false,
        issues: [expect.objectContaining({ rule: 'not-accessible' })],
      });
    });

    it('does not list plain text folded into its parent', () => {
      expect(audit([pressable({ role: 'button' }, [label('Save')])])).toHaveLength(1);
    });

    it('expects pressable text inside a paragraph to have a role', () => {
      const paragraph = (props: Record<string, unknown>) =>
        node('RCTText', { accessible: true }, [
          text('Read the '),
          node('RCTVirtualText', { isPressable: true, ...props }, [text('terms')]),
        ]);

      expect(rules([paragraph({})])).toEqual(['missing-role']);
      expect(rules([paragraph({})], 'android')).toEqual(['missing-role']);
      expect(rules([paragraph({ accessibilityRole: 'link' })])).toEqual([]);
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
  });

  describe('images', () => {
    it('warns about an image with no label that is not marked decorative', () => {
      expect(rules([node('RCTImageView')])).toEqual(['image-missing-label']);
    });

    it('flags an image with a label that VoiceOver skips because it is not accessible', () => {
      const image = node('RCTImageView', { accessibilityLabel: 'Logo' });

      expect(rules([image], 'ios')).toEqual(['not-accessible']);
      expect(rules([image], 'android')).toEqual([]);
    });

    it('flags an invalid accessibilityRole on an image a screen reader does not stop on', () => {
      expect(rules([node('RCTImageView', { accessibilityRole: 'heading' })], 'android')).toEqual([
        'image-missing-label',
        'invalid-role',
      ]);
      expect(
        rules([node('RCTImageView', { accessibilityRole: 'heading', accessibilityLabel: 'Logo' })]),
      ).toEqual(['not-accessible', 'invalid-role']);
    });

    it('reports a focusable image without a label under the image rule', () => {
      expect(rules([node('RCTImageView', { accessible: true })])).toEqual(['image-missing-label']);
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

    it('skips a subtree hidden with display: none', () => {
      const props = { style: [{ flex: 1 }, { display: 'none' }] };

      expect(audit([node('RCTView', props, [button()])])).toEqual([]);
      expect(audit([node('RCTView', props, [button()])], 'android')).toEqual([]);
    });

    it('skips a subtree hidden with aria-hidden, as libraries hide off-screen pages', () => {
      expect(audit([node('RCTView', HIDDEN, [button()])])).toEqual([]);
      expect(audit([node('RCTView', HIDDEN, [button()])], 'android')).toEqual([]);
    });

    it('still flags an invalid accessibilityRole in a hidden subtree, which Android throws on', () => {
      const tree = [node('RCTView', HIDDEN, [node('RCTView', { accessibilityRole: 'heading' })])];

      expect(rules(tree, 'android')).toEqual(['invalid-role']);
    });

    it('honours the hiding props only on the platform they work on', () => {
      const iosOnly = node('RCTView', { accessibilityElementsHidden: true }, [button()]);
      const androidOnly = node('RCTView', { importantForAccessibility: 'no-hide-descendants' }, [
        button(),
      ]);
      const focusable = (tree: HostNode, platform: Platform) =>
        audit([tree], platform).map((element) => element.focusable);

      expect(focusable(iosOnly, 'ios')).toEqual([]);
      expect(focusable(iosOnly, 'android')).toEqual([true]);
      expect(focusable(androidOnly, 'android')).toEqual([]);
      expect(focusable(androidOnly, 'ios')).toEqual([true]);
    });

    it('reads text that passes aria-hidden on unused', () => {
      const decor = node('RCTText', { accessible: true, 'aria-hidden': true }, [text('Decor')]);

      expect(audit([decor]).map((element) => element.label)).toEqual(['Decor']);
    });

    it('audits only the top screen of a native stack', () => {
      const screen = (title: string) => node('RNSScreen', {}, [label(title)]);
      const stack = node('RNSScreenStack', {}, [screen('Home'), screen('Details')]);

      expect(audit([stack]).map((element) => element.label)).toEqual(['Details']);
    });

    it('audits the top screen of a native stack when a preloaded screen follows it', () => {
      const stack = node('RNSScreenStack', {}, [
        node('RNSScreen', { activityState: 2 }, [label('Home')]),
        node('RNSScreen', { activityState: 2 }, [label('Details')]),
        node('RNSScreen', { activityState: 0 }, [label('Preloaded')]),
      ]);

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
    it('flags a role React Native does not know and treats the control as having none', () => {
      expect(rules([pressable({ role: 'buton' }, [label('Save')])])).toEqual([
        'missing-role',
        'invalid-role',
      ]);
    });

    it('checks accessibilityRole even next to a valid role, since Android applies both', () => {
      expect(
        rules([pressable({ role: 'button', accessibilityRole: 'buton' }, [label('Save')])]),
      ).toEqual(['invalid-role']);
    });

    it('falls back to a valid accessibilityRole when role is invalid', () => {
      const [checkbox] = audit([
        pressable({ role: 'chekbox', accessibilityRole: 'checkbox' }, [label('Terms')]),
      ]);

      expect(checkbox.issues.map((issue) => issue.rule)).toEqual(['invalid-role', 'missing-state']);
      expect(checkbox.announcement).toBe('Terms, checkbox');
    });

    it('flags an invalid role on an element a screen reader does not stop on', () => {
      expect(rules([node('RCTView', { accessibilityRole: 'heading' }, [label('Title')])])).toEqual([
        'invalid-role',
      ]);
      expect(
        rules([
          pressable({ role: 'button' }, [
            node('RCTView', { accessibilityRole: 'heading' }, [text('Order')]),
            label('Save'),
          ]),
        ]),
      ).toEqual(['invalid-role']);
    });

    it('flags accessibilityRole="tabbar" before React Native 0.88, where Android throws', () => {
      const tabBar = [node('RCTView', { accessibilityRole: 'tabbar' }, [label('Home')])];

      expect(rules(tabBar, 'android', { major: 0, minor: 87 })).toEqual(['invalid-role']);
      expect(rules(tabBar, 'ios', { major: 0, minor: 87 })).toEqual(['invalid-role']);
      expect(rules(tabBar, 'android', { major: 0, minor: 88 })).toEqual([]);
    });

    it('flags a control whose role does not say it can be activated', () => {
      expect(rules([pressable({ role: 'none' }, [label('Save')])])).toEqual(['missing-role']);
      expect(rules([pressable({ accessibilityRole: 'header' }, [label('Save')])])).toEqual([
        'missing-role',
      ]);
    });

    it('expects checkable text to say whether it is checked', () => {
      expect(
        rules([
          node('RCTText', { accessible: true, role: 'checkbox', onPress: () => undefined }, [
            text('Terms'),
          ]),
        ]),
      ).toEqual(['missing-state']);
    });

    it('expects a slider role on any host but a native slider to handle its value and actions', () => {
      expect(
        rules([
          node('RCTText', { accessible: true, role: 'slider', accessibilityLabel: 'Volume' }),
        ]),
      ).toEqual(['missing-value', 'missing-adjust-actions']);
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
      expect(rules([checkbox({ accessibilityState: { checked: false } })])).toEqual([]);
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

      expect(audit([slider({ accessibilityValue: { now: 4, min: 0, max: 10 } })])[0].value).toBe(
        '40%',
      );
      // A number alone is not announced: both platforms need its range.
      expect(rules([slider({ accessibilityValue: { now: 4 } })])).toEqual(['missing-value']);
    });

    it('accepts a progress bar without a value, which is how an indeterminate one looks', () => {
      const withRole = (role: string) =>
        node('RCTView', { accessible: true, role, accessibilityLabel: 'Loading' });

      expect(rules([withRole('progressbar')])).toEqual([]);
      expect(rules([withRole('meter')])).toEqual(['missing-value']);
    });

    it('leaves native sliders to announce their own value', () => {
      const slider = (type: string) =>
        node(type, { accessible: true, role: 'slider', accessibilityLabel: 'Volume' });

      expect(rules([slider('RNCSlider')])).toEqual([]);
      expect(rules([slider('RCTView')])).toContain('missing-value');
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
      ).toEqual(['unused-action-handler']);
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
          accessibilityValue: { now: 4, min: 0, max: 10 },
          accessibilityActions: names.map((name) => ({ name })),
          onAccessibilityAction: () => undefined,
        });

      expect(rules([slider(['activate'])])).toEqual(['missing-adjust-actions']);
      expect(rules([slider(['increment', 'decrement'])])).toEqual([]);
    });

    it('treats role="slider" as adjustable', () => {
      expect(
        rules([
          node('RCTView', {
            accessible: true,
            role: 'slider',
            accessibilityLabel: 'Volume',
            accessibilityValue: { text: '4' },
          }),
        ]),
      ).toEqual(['missing-adjust-actions']);
    });

    it('reports both an unhandled action and missing increment on one element', () => {
      const [element] = audit([
        node('RCTView', {
          accessible: true,
          accessibilityRole: 'adjustable',
          accessibilityLabel: 'Volume',
          accessibilityValue: { now: 4, min: 0, max: 10 },
          onAccessibilityAction: () => undefined,
        }),
      ]);
      expect(element.issues.map((issue) => issue.rule)).toEqual([
        'unused-action-handler',
        'missing-adjust-actions',
      ]);
    });

    it('leaves native sliders to handle increment and decrement themselves', () => {
      expect(
        rules([
          node('RNCSlider', {
            accessible: true,
            role: 'slider',
            accessibilityLabel: 'Volume',
          }),
        ]),
      ).toEqual([]);
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

    it('ignores a disabled prop on a view, which only Text and Switch act on', () => {
      expect(
        rules([
          pressable({ role: 'button', disabled: true, pointerEvents: 'none' }, [label('Pay')]),
        ]),
      ).toEqual(['missing-disabled-state']);
    });

    it('accepts it when the control is marked disabled', () => {
      expect(
        rules([
          pressable(
            { role: 'button', pointerEvents: 'none', accessibilityState: { disabled: true } },
            [label('Pay')],
          ),
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

  it('lists a live region container a screen reader does not stop on', () => {
    const tree = [
      node('RCTView', { accessibilityLiveRegion: 'assertive' }, [
        node('RCTText', {}, [text('Error')]),
      ]),
    ];
    const summary = (platform: Platform) =>
      audit(tree, platform).map((item) => [item.label, item.liveRegion, item.focusable]);

    expect(summary('android')).toEqual([
      ['Error', 'assertive', false],
      ['Error', null, true],
    ]);
    expect(summary('ios')).toEqual([['Error', null, true]]);
  });

  it('audits what is inside an empty Text', () => {
    expect(rules([node('RCTText', {}, [pressable({}, [node('RCTImageView')])])])).toEqual([
      'missing-label',
      'missing-role',
    ]);
    expect(audit([node('RCTText', { accessibilityLiveRegion: 'polite' })], 'android')).toEqual([
      expect.objectContaining({ liveRegion: 'polite', focusable: false }),
    ]);
  });

  it('lists a live region folded into an accessible parent', () => {
    const tree = [
      pressable({ role: 'button' }, [
        node('RCTView', { accessibilityLiveRegion: 'polite' }, [
          node('RCTText', {}, [text('3 items')]),
        ]),
      ]),
    ];
    const summary = (platform: Platform) =>
      audit(tree, platform).map((item) => [item.label, item.liveRegion, item.focusable]);

    expect(summary('android')).toEqual([
      ['3 items', null, true],
      ['3 items', 'polite', false],
    ]);
    expect(summary('ios')).toEqual([['3 items', null, true]]);
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

    it('flags text with font scaling disabled even when hidden from screen readers', () => {
      const [element] = audit([
        node('RCTView', HIDDEN, [node('RCTText', { allowFontScaling: false }, [text('Price')])]),
      ]);
      expect(element).toMatchObject({
        label: 'Price',
        focusable: false,
        issues: [expect.objectContaining({ rule: 'font-scaling-disabled' })],
      });
      expect(
        audit([
          node('RCTView', { ...HIDDEN, style: { display: 'none' } }, [
            node('RCTText', { allowFontScaling: false }, [text('Price')]),
          ]),
        ]),
      ).toEqual([]);
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
    const checkbox = pressable({ role: 'checkbox', accessibilityState: { checked: false } }, [
      label('Terms'),
    ]);
    const slider = node('RCTView', {
      accessible: true,
      role: 'slider',
      accessibilityLabel: 'Volume',
      accessibilityValue: { now: 4, min: 0, max: 10 },
    });
    const input = node('AndroidTextInput', { accessibilityLabel: 'Email' });

    expect(
      audit([checkbox, slider, input], 'android').map((element) => element.announcement),
    ).toEqual(['not checked, Terms, check box', '40%, Volume, slider', 'Email, edit box']);
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

  it('names the prop that hides a control from screen readers', () => {
    const message = (props: Record<string, unknown>, platform: Platform = 'ios') =>
      audit([node('RCTView', { role: 'button', ...props }, [label('Save')])], platform)[0].issues[0]
        .message;

    expect(message({ accessible: false })).toContain('accessible={false}');
    expect(message({ importantForAccessibility: 'no' }, 'android')).toContain(
      'importantForAccessibility="no"',
    );
    expect(message({})).toContain('accessible={true} is missing');
  });

  it('ignores importantForAccessibility="no" on iOS, where it has no effect', () => {
    const button = pressable({ role: 'button', importantForAccessibility: 'no' }, [label('Save')]);

    expect(audit([button], 'ios')[0]).toMatchObject({ focusable: true, issues: [] });
    expect(audit([button], 'android')[0]).toMatchObject({
      focusable: false,
      issues: [expect.objectContaining({ rule: 'not-accessible' })],
    });
  });

  it('reports font scaling on text that is not a screen reader stop', () => {
    expect(
      rules([node('RCTText', { accessible: false, allowFontScaling: false }, [text('Hi')])]),
    ).toEqual(['font-scaling-disabled']);
    expect(
      rules([node('RCTSinglelineTextInputView', { accessible: false, allowFontScaling: false })]),
    ).toEqual(['not-accessible', 'font-scaling-disabled']);
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

  it('names app components that only share a prefix or suffix with framework ones', () => {
    const named = (componentPath: string[]) =>
      audit([{ ...pressable({ role: 'button' }, [label('Save')]), componentPath }])[0].component;

    expect(named(['App', 'ThemeProvider', 'Pressable', 'View'])).toBe('ThemeProvider');
    expect(named(['App', 'AnimatedHeader', 'Animated(View)', 'View'])).toBe('AnimatedHeader');
    expect(named(['App', 'ScrollViewFooter', 'ScrollView', 'View'])).toBe('ScrollViewFooter');
  });

  it('skips the wrapper React Native puts around pressable text', () => {
    const named = (wrapper: string) =>
      audit([
        {
          ...node('RCTText', { accessible: true, role: 'link', isPressable: true }, [
            text('Terms'),
          ]),
          ownerPath: [wrapper, 'Text', 'LoginScreen'],
        },
      ])[0].component;

    expect(named('NativePressableText')).toBe('LoginScreen');
    expect(named('PressableText')).toBe('LoginScreen');
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
    const result = auditHostTree(
      [pressable({ role: 'button' }, [label('Save')], frame)],
      'ios',
      REACT_NATIVE,
    );

    expect(result.measureById.get(result.elements[0].id)?.()).toEqual(frame);
  });

  describe('modals', () => {
    const button = (name: string) => pressable({ role: 'button' }, [label(name)]);
    const labels = (roots: HostNode[], platform: Platform = 'ios') =>
      audit(roots, platform).map((element) => element.label);

    it('hides the siblings of a modal view on iOS only', () => {
      const tree = [
        node('RCTView', {}, [
          button('Behind'),
          node('RCTView', { accessibilityViewIsModal: true }, [button('Dialog')]),
        ]),
      ];
      expect(labels(tree, 'ios')).toEqual(['Dialog']);
      expect(labels(tree, 'android')).toEqual(['Behind', 'Dialog']);
    });

    it('ignores aria-modal on a plain view, which passes it on unused', () => {
      const tree = [
        node('RCTView', {}, [
          button('Behind'),
          node('RCTView', { 'aria-modal': true }, [button('Dialog')]),
        ]),
      ];
      expect(labels(tree)).toEqual(['Behind', 'Dialog']);
    });

    it('ignores a modal view that is not displayed', () => {
      const tree = [
        node('RCTView', {}, [
          button('Behind'),
          node('RCTView', { accessibilityViewIsModal: true, style: { display: 'none' } }, [
            button('Dialog'),
          ]),
        ]),
      ];
      expect(labels(tree)).toEqual(['Behind']);
    });

    it('still checks font scaling of text behind a modal view', () => {
      const tree = [
        node('RCTView', {}, [
          node('RCTText', { allowFontScaling: false }, [text('Price')]),
          node('RCTView', { accessibilityViewIsModal: true }, [button('Dialog')]),
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

    it('ignores a Modal on a screen that is not displayed', () => {
      const tree = [
        node('RNSScreenContainer', {}, [
          node('RNSScreen', { activityState: 2 }, [button('Home')]),
          node('RNSScreen', { activityState: 0 }, [
            node('RCTModalHostView', {}, [button('Hidden dialog')]),
          ]),
          node('RCTView', { style: { display: 'none' } }, [
            node('RCTModalHostView', {}, [button('Collapsed dialog')]),
          ]),
        ]),
      ];
      expect(labels(tree)).toEqual(['Home']);
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
      node('RCTView', HIDDEN, [
        node('RNSScreenStack', {}, [screen(2, 'Covered'), screen(2, 'Top')]),
      ]),
    ];
    expect(audit(tree).map((element) => element.label)).toEqual(['Top']);
  });
});
