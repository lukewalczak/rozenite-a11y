import type { AccessibilityElement, AccessibilityElementKind, Platform } from '../shared/types';

const SPOKEN_ROLES: Record<string, string> = {
  adjustable: 'adjustable',
  header: 'heading',
  heading: 'heading',
  imagebutton: 'button',
  img: 'image',
  none: '',
  presentation: '',
  search: 'search field',
  searchbox: 'search field',
  text: '',
  togglebutton: 'toggle button',
};

const SPOKEN_KINDS: Partial<Record<AccessibilityElementKind, string>> = {
  image: 'image',
  input: 'text field',
  switch: 'switch',
};

// TalkBack's names for the roles it words differently from VoiceOver.
const ANDROID_SPOKEN_ROLES: Record<string, string> = {
  checkbox: 'check box',
  radio: 'radio button',
};

// iOS gives these roles no trait, so VoiceOver says no role for them.
const IOS_SPOKEN_ROLES: Record<string, string> = {
  slider: '',
};

export const getAnnouncement = (
  element: Pick<AccessibilityElement, 'label' | 'kind' | 'states' | 'value'> & {
    /** The role the platform applies, which is not always the declared one. */
    role: string | null;
  },
  platform: Platform,
) => {
  const isAndroid = platform === 'android';
  let role = element.role
    ? (SPOKEN_ROLES[element.role] ?? element.role)
    : (SPOKEN_KINDS[element.kind] ?? '');
  if (isAndroid) {
    role = element.kind === 'input' ? 'edit box' : (ANDROID_SPOKEN_ROLES[role] ?? role);
  } else if (element.role) {
    role = IOS_SPOKEN_ROLES[element.role] ?? role;
  }
  // TalkBack leads with state and value by default; VoiceOver ends with them.
  const parts = isAndroid
    ? [...element.states, element.value, element.label, role]
    : [element.label, element.value, role, ...element.states];
  return parts.filter(Boolean).join(', ');
};
