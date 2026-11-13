export const INTERACTIVE_ROLES = new Set([
  'adjustable',
  'button',
  'checkbox',
  'combobox',
  'imagebutton',
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

export const CHECKABLE_ROLES = new Set(['checkbox', 'radio', 'switch', 'togglebutton']);

export const VALUE_ROLES = new Set(['adjustable', 'meter', 'progressbar', 'slider', 'spinbutton']);

export const ADJUSTABLE_ROLES = new Set(['adjustable', 'slider']);
