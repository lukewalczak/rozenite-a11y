# rozenite-a11y

A [Rozenite](https://www.rozenite.dev) plugin for auditing the accessibility of the screen your app is showing, in React Native DevTools.

It reads the mounted component tree and lists what a screen reader would stop on, in order, with the text it would announce. Elements that break a rule are flagged, and selecting one outlines it in the app.

## Features

- **Reading order**: every element a screen reader can focus on the current screen, with its announcement (label, role, value and state). Elements listed only because they have an issue or are a live region are marked as not focusable.
- **Rule checks**: labels, roles, state and values, actions, touch targets, font scaling and controls a screen reader cannot reach, described under [Rules](#rules).
- **Live regions**: which elements announce their changes on their own, including containers a screen reader does not stop on (Android only; VoiceOver ignores `aria-live`).
- **Filter and search**: show all elements, only those with issues or only live regions, and search by announcement, component, host view or rule.
- **Element details**: label, role, hint, value, state, actions, live region, whether it is interactive, size and position of the selected element, its host view and the components above it.
- **System settings**: screen reader, font scale, reduce motion and other accessibility settings of the device, read when the audit runs. The platform and the font scale are always shown, other settings only when they are on; one the platform does not have counts as off.

## Requirements

- [Rozenite](https://www.rozenite.dev/docs/getting-started) 2.5 or newer.
- The [New Architecture](https://reactnative.dev/architecture/landing-page), the default since React Native 0.76. On the old architecture elements cannot be measured, so touch targets are not checked and nothing is outlined.
- A debug build (`__DEV__`). The tree is read through the React DevTools hook, which only exists in development.

## Installation

```bash
npm install rozenite-a11y
npm install --save-dev @rozenite/metro
```

Install `rozenite-a11y` as a regular dependency: the import stays in your app code.

Enable Rozenite in `metro.config.js`. In an Expo app the default config comes from `expo/metro-config`; in a bare app use `@react-native/metro-config` instead:

```js
const { getDefaultConfig } = require('expo/metro-config');
const { withRozenite } = require('@rozenite/metro');

const config = getDefaultConfig(__dirname);

module.exports = withRozenite(config, {
  enabled: process.env.WITH_ROZENITE === 'true',
});
```

Then start Metro with `WITH_ROZENITE=true`. See the [Rozenite getting started guide](https://www.rozenite.dev/docs/getting-started) for other options.

## Usage

Render `RozeniteAccessibility` once, after the rest of your app, so the outline is drawn on top:

```tsx
import { RozeniteAccessibility } from 'rozenite-a11y';

function App() {
  return (
    <>
      <RootNavigator />
      <RozeniteAccessibility />
    </>
  );
}
```

Open the **Accessibility** panel in React Native DevTools. It audits the screen that is visible when the panel connects, and again after the app reloads; press **Run audit** to audit again after navigating.

The component is **development-only**: in production and in tests (`NODE_ENV` set to `production` or `test`) and on platforms other than iOS and Android it renders nothing. Production bundles leave the audit code out.

The package also exports the audit's TypeScript types (`AccessibilityAudit`, `AccessibilityElement`, `AccessibilityRuleId`, …).

## Rules

Errors stop a screen reader user or crash the app on Android; everything else is a warning. The panel search matches rule IDs and titles.

| Rule                     | Title in the panel              | Checks                                                                                                                                                                                                    | Severity                                                  |
| ------------------------ | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `missing-label`          | Missing label                   | Controls a screen reader cannot name, and elements it stops on that have nothing to announce                                                                                                              | error on a control, warning on an element that is not one |
| `input-missing-label`    | Input without a label           | Text inputs without a label, or described only by a placeholder                                                                                                                                           | error, warning when there is a placeholder                |
| `image-missing-label`    | Image without a label           | Images that are not controls and have no label                                                                                                                                                            | error when a screen reader stops on it, warning otherwise |
| `missing-role`           | Missing role                    | Pressable elements without a role, or with a role such as `none` or `header` that does not say they can be activated                                                                                      | warning                                                   |
| `invalid-role`           | Invalid role                    | Roles React Native ignores, `accessibilityRole` values that make Android throw, and `role="slider"` on iOS, which VoiceOver does not treat as adjustable                                                  | error for `accessibilityRole`, warning for `role`         |
| `missing-state`          | Missing state                   | Checkboxes, radios, switches and toggle buttons that do not say whether they are on                                                                                                                       | warning                                                   |
| `missing-value`          | Missing value                   | Sliders, adjustable elements, meters and spin buttons without a value (a text, or a number with a minimum and a larger maximum); `@react-native-community/slider` is exempt                               | warning                                                   |
| `font-scaling-disabled`  | Font scaling disabled           | Text and text inputs that ignore the font size set in system settings (`allowFontScaling={false}` or `maxFontSizeMultiplier={1}`)                                                                         | warning                                                   |
| `unhandled-actions`      | Unhandled actions               | Declared accessibility actions nothing handles, and actions without a name, which crash the app                                                                                                           | error                                                     |
| `unused-action-handler`  | Action handler without actions  | `onAccessibilityAction` with no declared actions, except on an adjustable element on iOS, where it receives increment and decrement                                                                       | warning                                                   |
| `missing-adjust-actions` | Missing increment and decrement | Adjustable elements that cannot be adjusted: without the `increment` and `decrement` actions on Android (sliders too), without `onAccessibilityAction` on iOS; `@react-native-community/slider` is exempt | warning                                                   |
| `missing-disabled-state` | Missing disabled state          | Controls that ignore touches but are announced as usable                                                                                                                                                  | warning                                                   |
| `small-touch-target`     | Small touch target              | Controls smaller than 44×44 pt on iOS or 48×48 dp on Android, counting `hitSlop`. Links inside a paragraph and the native iOS switch are exempt                                                           | warning                                                   |
| `nested-interactive`     | Nested control                  | Controls inside another accessible element. VoiceOver cannot reach them; TalkBack focuses them on their own, so they need a label and a role of their own                                                 | error on iOS, warning on Android                          |
| `not-accessible`         | Hidden from screen readers      | Controls hidden by `accessible={false}` (on Android only when not `focusable`, which Pressable and the Touchables are by default) or `importantForAccessibility="no"` (Android), pressable views without `accessible`, and, on iOS, labelled images without `accessible`                            | warning                                                   |

## How it works

An audit is a snapshot of the screen at the moment it runs. It does not drive a screen reader: it reads the props and layout of what is mounted and works out what VoiceOver or TalkBack would do with them, using the rules of the platform the app runs on.

1. The app reads the mounted React trees through the React DevTools hook and reduces them to their host views (`RCTView`, `RCTText` and so on), keeping the names of the components above each one. React Native's development overlays and this plugin's own outline are left out.
2. The host views are visited in tree order. For each one the audit decides whether a screen reader stops on it, folds it into an accessible parent or cannot reach it, assembles the text it would announce and checks the rules above. Only what is on screen counts: the top screen of a react-native-screens stack, the content of an open `<Modal>` and what a modal view leaves reachable on iOS.
3. Each element is measured on the device, for the touch target check and the outline.

## Notes

- The audit does not replace testing with VoiceOver or TalkBack, and it does not check colour contrast or focus order.
- A control counts as ignoring touches when it or an ancestor sets `pointerEvents="none"`, or an ancestor sets `pointerEvents="box-only"`, as a prop or in `style`. Other ways of disabling it, such as `editable={false}` on a text input, are not checked.
- The reading order follows the component tree, which is an approximation of the order the platform uses.
- Native views that are not React components (maps, web views, native navigation bars) are not part of the audit.
- Controls under `aria-hidden` are not listed, since navigation libraries hide off-screen pages that way. Elements there are listed only when they have an invalid role or text that ignores font scaling, since those matter without a screen reader too.
- Every mounted React root is audited together, so in apps with a root per screen (such as react-native-navigation) covered screens are listed too. Behind an open transparent `<Modal>`, only invalid roles and text that ignores font scaling are listed.
- The outline is measured again when an element is selected, in an overlay that ignores touches and is hidden from screen readers. It does not follow scrolling or animation, and stays in place after navigating until another element is selected or the audit runs again.
- The outline is drawn in the app's own window, so it is hidden behind an open `<Modal>` or a native modal screen.
- When the React Native root view does not start at the top of the window, as in some brownfield apps, the outline may be offset.

## Troubleshooting

- **"The app did not answer"**: the app is not connected, or `<RozeniteAccessibility />` is not rendered. Check that Metro was started with Rozenite enabled.
- **"The React DevTools hook is not available"**: the app is not running in development mode.
- **No touch target issues and no outline**: the app runs on the old architecture, see [Requirements](#requirements).
- **"No issues found"**: this does not mean the screen is accessible; see [Notes](#notes) for what the audit does not check.

## Development

Requires Node.js 22 and pnpm 12.

```bash
pnpm install
pnpm test
pnpm build
```

CI also runs `lint`, `format:check`, `typecheck` and the example's `typecheck`, and fails a pull request without a changeset (`pnpm changeset`).

`example/` is an Expo app with a screen that breaks the rules next to a correct version of it. Build the plugin, then start the app in Expo Go:

```bash
pnpm build
pnpm --filter rozenite-a11y-example ios
```

Use `android` for Android. On a physical device, Expo Go has to support Expo SDK 58; otherwise build the app with `WITH_ROZENITE=true pnpm --filter rozenite-a11y-example exec expo run:ios` (or `run:android`).

`pnpm dev` starts the Rozenite dev server for the panel. To load the panel from it instead of `dist`, start the app's Metro with `ROZENITE_DEV_MODE=rozenite-a11y`.

## License

[MIT](LICENSE)
