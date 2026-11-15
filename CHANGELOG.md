# rozenite-a11y

## 0.1.2

### Patch Changes

- [`753547f`](https://github.com/lukewalczak/rozenite-a11y/commit/753547fb68b60faa0fc1b1027921da0304a4c433) Thanks [@lukewalczak](https://github.com/lukewalczak)! - Follow the platform more closely in the action and role rules:
  
  - iOS: `role="slider"` is reported as `invalid-role`, since VoiceOver does not treat it as adjustable, and is no longer announced as a slider.
  - iOS: an adjustable element with `onAccessibilityAction` no longer gets `missing-adjust-actions` or `unused-action-handler`; one without the handler gets `missing-adjust-actions`.
  - Android: an accessible element nested in a control is listed as its own stop, and its text is no longer part of the control's label.
  - An accessibility action without a string name is reported as `unhandled-actions`, since it crashes the app.
  - The `invalid-role` message no longer says iOS ignores `accessibilityRole` values it applies, such as `heading` and `img`.
  - The outline is not drawn for an element that is no longer on screen.

## 0.1.1

### Patch Changes

- [`4ceb195`](https://github.com/lukewalczak/rozenite-a11y/commit/4ceb195aecd4cab8cefee33bd70f94909e2cc8b7) Thanks [@lukewalczak](https://github.com/lukewalczak)! - Use "An" before roles that start with a vowel in the `missing-value` message ("An adjustable has to announce its current value").

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
