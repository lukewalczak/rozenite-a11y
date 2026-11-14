# rozenite-a11y

## 0.1.0

### Minor Changes

- [`3c5791d`](https://github.com/lukewalczak/rozenite-a11y/commit/3c5791df842f00a158bd820060927e6e31128c11) Thanks [@lukewalczak](https://github.com/lukewalczak)! - Split the `unhandled-actions` rule: a handler with no declared actions is now `unused-action-handler`, and an adjustable element without increment and decrement is `missing-adjust-actions`. `unhandled-actions` keeps declared actions nothing handles.
  
  Audit changes:
  
  - Pressable text inside a paragraph without a role is flagged with `missing-role`.
  - Raw `aria-*` and `alt` props that reach a host view unconverted no longer count as a label, state or value, since native ignores them.
  - `accessibilityRole="tabbar"` is flagged as an invalid role before React Native 0.88, where Android throws on it.
  - An invalid `accessibilityRole` on an image a screen reader does not stop on is now reported.
  - A preloaded screen at the end of a native stack no longer hides the top screen from the audit.
  - Pressable `Text` is named after the app component that rendered it, not React Native's internal wrapper.
  
  `RozeniteAccessibility` renders nothing when `NODE_ENV` is `test`. Install the package as a regular dependency, not a dev dependency.
