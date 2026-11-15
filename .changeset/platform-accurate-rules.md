---
'rozenite-a11y': patch
---

Follow the platform more closely in the action and role rules:

- iOS: `role="slider"` is reported as `invalid-role`, since VoiceOver does not treat it as adjustable, and is no longer announced as a slider.
- iOS: an adjustable element with `onAccessibilityAction` no longer gets `missing-adjust-actions` or `unused-action-handler`; one without the handler gets `missing-adjust-actions`.
- Android: an accessible element nested in a control is listed as its own stop, and its text is no longer part of the control's label.
- An accessibility action without a string name is reported as `unhandled-actions`, since it crashes the app.
- The `invalid-role` message no longer says iOS ignores `accessibilityRole` values it applies, such as `heading` and `img`.
- The outline is not drawn for an element that is no longer on screen.
