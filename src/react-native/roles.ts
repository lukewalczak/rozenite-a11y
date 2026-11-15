export const INTERACTIVE_ROLES = new Set([
  'adjustable',
  'button',
  'checkbox',
  'combobox',
  'dropdownlist',
  'imagebutton',
  'keyboardkey',
  'link',
  'menuitem',
  'radio',
  'searchbox',
  'slider',
  'spinbutton',
  'switch',
  'tab',
  'togglebutton',
]);

// Values of the `accessibilityRole` prop. Anything else is ignored by React Native.
export const ACCESSIBILITY_ROLES = new Set(
  (
    'none button dropdownlist togglebutton link search image keyboardkey text adjustable ' +
    'imagebutton header summary alert checkbox combobox menu menubar menuitem progressbar ' +
    'radio radiogroup scrollbar spinbutton switch tab tabbar tablist timer list toolbar grid ' +
    'pager scrollview horizontalscrollview viewgroup webview drawerlayout slidingdrawer iconmenu'
  ).split(' '),
);

// Not values of `accessibilityRole`, so Android throws, but iOS turns them into traits.
export const IOS_ONLY_ACCESSIBILITY_ROLES = new Set([
  'disabled',
  'heading',
  'img',
  'key',
  'plays',
  'selected',
]);

// Values of the `role` prop, which follows ARIA.
export const ARIA_ROLES = new Set(
  (
    'alert alertdialog application article banner button cell checkbox columnheader combobox ' +
    'complementary contentinfo definition dialog directory document feed figure form grid ' +
    'group heading img link list listitem log main marquee math menu menubar menuitem meter ' +
    'navigation none note option presentation progressbar radio radiogroup region row ' +
    'rowgroup rowheader scrollbar searchbox separator slider spinbutton status summary switch ' +
    'tab table tablist tabpanel term timer toolbar tooltip tree treegrid treeitem'
  ).split(' '),
);

export type ReactNativeVersion = { major: number; minor: number };

// Android's role enum has no `tabbar` before React Native 0.88, so the value throws there.
export const isTabBarRejectedOnAndroid = ({ major, minor }: ReactNativeVersion): boolean =>
  major === 0 && minor < 88;

export const CHECKABLE_ROLES = new Set(['checkbox', 'radio', 'switch', 'togglebutton']);

// A progress bar is left out: an indeterminate one has no value to announce.
export const VALUE_ROLES = new Set(['adjustable', 'meter', 'slider', 'spinbutton']);

export const ADJUSTABLE_ROLES = new Set(['adjustable', 'slider']);
