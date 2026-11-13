export const isUnknownArray = (value: unknown): value is unknown[] => Array.isArray(value);

export const asObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

/** A string prop with its whitespace collapsed; anything else is an empty string. */
export const normalizeText = (value: unknown): string =>
  typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';

export const flattenStyle = (style: unknown): Record<string, unknown> =>
  isUnknownArray(style)
    ? style.reduce<Record<string, unknown>>(
        (result, entry) => Object.assign(result, flattenStyle(entry)),
        {},
      )
    : asObject(style);
