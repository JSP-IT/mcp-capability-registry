/**
 * Locale-independent string ordering (UTF-16 code unit order).
 * `localeCompare` depends on the runtime's ICU data and default locale,
 * which would make report ordering differ between machines.
 */
export function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
