# rozenite-a11y

A [Rozenite](https://www.rozenite.dev) plugin for auditing the accessibility of the screen your app is showing, in React Native DevTools.

It reads the mounted component tree and lists what a screen reader would stop on, in order, with the text it would announce. Elements that break a rule are flagged, and selecting one outlines it in the app.

## Features

- **Reading order**: every element a screen reader can focus on the current screen, with its announcement (label, role, value and state). Elements listed only for an issue or a live region are marked as not focusable
- **Missing labels**: controls, images and text inputs a screen reader cannot name, and inputs described only by a placeholder
- **Missing roles**: pressable elements without a role, or with a role such as `none` or `header` that does not say they can be activated
- **Invalid roles**: roles React Native ignores, and `accessibilityRole` values that make Android throw
- **Missing state and values**: checkboxes, radios, switches and toggle buttons that do not say whether they are on; sliders, meters and spin buttons without a value. A value counts when it is a text, or a number together with its minimum and maximum, since that is what both platforms announce
- **Font scaling**: text that ignores the font size set in system settings
- **Accessibility actions**: declared actions nothing handles, handlers with no actions, adjustable elements without increment and decrement
- **Disabled state**: controls that ignore touches but are announced as usable
- **Live regions**: which elements announce their changes on their own, including containers a screen reader does not stop on (Android only; VoiceOver ignores `aria-live`)
- **Touch targets**: controls smaller than 44×44 pt on iOS or 48×48 dp on Android, counting `hitSlop`. Links inside a paragraph and the native iOS switch are exempt
- **Nested controls**: controls inside another accessible element. VoiceOver cannot reach them; TalkBack focuses them on their own, so they need a label and a role of their own
- **Hidden controls**: controls a screen reader cannot reach, because of `accessible={false}`, `importantForAccessibility="no"` (Android) or a missing `accessible`, and images with an `accessibilityLabel` but no `accessible`, which VoiceOver skips
- **Filter and search**: show all elements, only those with issues or only live regions, and search by announcement, component, host view or rule
- **Element details**: label, role, hint, value, state, actions, size and position of the selected element, and the components above it
- **Outline in the app**: select an element in the panel to see where it is on the device
- **Component names**: each element names the component that rendered it
- **System settings**: screen reader, font scale, reduce motion and other accessibility settings of the device

Issues are **errors** when they stop a screen reader user, such as a control with no name, a declared action nothing handles or a control VoiceOver cannot focus, or when they crash the app on Android. Everything else is a **warning**: it makes the screen harder to use, but not impossible.

## Installation

```bash
npm install rozenite-a11y
```

Install it as a regular dependency: the import stays in your app code, so a release build that skips dev dependencies could not resolve it.

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

Open the **Accessibility** panel in React Native DevTools. It audits the screen that is visible when it connects, and again after the app reloads; press **Run audit** to audit again after navigating.

The package also exports the types of the audit result, such as `AccessibilityAudit`, `AccessibilityElement`, `AccessibilityIssue` and `AccessibilityRuleId`.

## How it works

An audit is a snapshot of the screen at the moment it runs. It does not drive a screen reader: it reads the props and layout of what is mounted and works out what VoiceOver or TalkBack would do with them, using the rules of the platform the app runs on.

1. `RozeniteAccessibility` connects to the panel through the Rozenite plugin bridge and tells it when the app is ready, so the panel can audit on its own.
2. When an audit runs, the app reads the mounted React trees through the React DevTools hook and reduces them to their host views (`RCTView`, `RCTText` and so on), keeping the names of the components above each one. React Native's development overlays and this plugin's own outline are left out.
3. The host views are visited in tree order. For each one the audit decides whether a screen reader stops on it, folds it into an accessible parent or cannot reach it, assembles the text it would announce and checks the rules above. Only what is on screen counts: the top screen of a react-native-screens stack, the content of an open `<Modal>` and what a modal view leaves reachable on iOS.
4. Each element is measured on the device, for the touch target check and the outline. Selecting an element in the panel measures it again and draws the outline in an overlay that ignores touches and is hidden from screen readers.

## Notes

- The component is **development-only**: in production and in tests (`NODE_ENV` set to `production` or `test`) and on platforms other than iOS and Android it renders nothing. Production bundles leave the audit code out.
- The audit does not replace testing with VoiceOver or TalkBack, and it does not check colour contrast or focus order.
- A control counts as ignoring touches when it or an ancestor sets `pointerEvents`. Other ways of disabling it, such as `editable={false}` on a text input, are not checked.
- The reading order follows the component tree, which is an approximation of the order the platform uses.
- Native views that are not React components (maps, web views, native navigation bars) are not part of the audit.
- Controls under `aria-hidden` are not listed, since navigation libraries hide off-screen pages that way.
- Every mounted React root is audited together, so in apps with a root per screen (such as react-native-navigation) covered screens are listed too.
- The outline is measured once, when an element is selected. It does not follow scrolling or animation, and stays in place after navigating until another element is selected or the audit runs again.
- The outline is drawn in the app's own window, so it is hidden behind an open `<Modal>` or a native modal screen.
- When the React Native root view does not start at the top of the window, as in some brownfield apps, the outline may be offset.
- The tree is read through the React DevTools hook, which exists in development builds only.

## Requirements

An app with [Rozenite set up](https://www.rozenite.dev/docs/getting-started), version 2.5 or newer, running on the [New Architecture](https://reactnative.dev/architecture/landing-page). On the old architecture elements cannot be measured, so touch targets are not checked and nothing is outlined.

## Development

```bash
pnpm install
pnpm test
pnpm build
```

`example/` is an Expo app with a screen that breaks every rule next to a correct version of it. Build the plugin, then start it:

```bash
pnpm build
pnpm --filter rozenite-a11y-example start
```

It needs a development build with Expo SDK 58 native modules; Expo Go from the store may be older.

`pnpm dev` starts the Rozenite dev host for working on the panel. To load the plugin from a local checkout in an app, start Metro with `ROZENITE_DEV_MODE=rozenite-a11y`.

## License

MIT
