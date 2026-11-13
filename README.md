# rozenite-a11y

A [Rozenite](https://www.rozenite.dev) plugin for auditing the accessibility of the screen your app is showing, in React Native DevTools.

It reads the mounted component tree and lists what a screen reader would stop on, in order, with the text it would announce. Elements that break a rule are flagged, and selecting one outlines it in the app.

## Features

- **Reading order**: every element a screen reader can focus on the current screen, with its announcement (label, role and state)
- **Missing labels**: controls, images and text inputs a screen reader cannot name
- **Missing roles**: pressable elements that are not announced as something to activate
- **Invalid roles, state and values**: roles React Native ignores, checkboxes that do not say whether they are checked, sliders without a value
- **Font scaling**: text that ignores the font size set in system settings
- **Accessibility actions**: declared actions nothing handles, handlers with no actions, adjustable elements without increment and decrement
- **Disabled state**: controls that ignore touches but are announced as usable
- **Live regions**: which elements announce their changes on their own
- **Touch targets**: controls smaller than 44×44 pt on iOS or 48×48 dp on Android, counting `hitSlop`
- **Nested controls**: controls inside another accessible element, which VoiceOver cannot reach
- **Outline in the app**: select an element in the panel to see where it is on the device
- **Component names**: each element names the component that rendered it
- **System settings**: screen reader, font scale, reduce motion and other accessibility settings of the device

## Installation

```bash
npm install -D rozenite-a11y
```

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

Open the **Accessibility** panel in React Native DevTools and press **Run audit**. The audit covers the screen that is visible at that moment; run it again after navigating.

## Notes

- The component is **development-only**: in production (`NODE_ENV === 'production'`) it renders nothing and the audit code is left out of the bundle.
- The audit is a static check of props and layout. It does not replace testing with VoiceOver or TalkBack, and it does not check colour contrast or focus order.
- The reading order follows the component tree, which is an approximation of the order the platform uses.
- Native views that are not React components (maps, web views, native navigation bars) are not part of the audit.
- The tree is read through the React DevTools hook, which exists in development builds only.

## Requirements

An app with [Rozenite set up](https://www.rozenite.dev/docs/getting-started), version 2.5 or newer.

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
