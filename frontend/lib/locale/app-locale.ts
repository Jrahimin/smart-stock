export type AppLocale = "en" | "bn";

export const LOCALE_COOKIE_NAME = "smart-stock-locale";

export const DEFAULT_LOCALE: AppLocale = "bn";

const SUPPORTED_LOCALES = new Set<AppLocale>(["en", "bn"]);

export function parseAppLocale(value: string | null | undefined): AppLocale {
  if (value && SUPPORTED_LOCALES.has(value as AppLocale)) {
    return value as AppLocale;
  }

  return DEFAULT_LOCALE;
}

export function writeAppLocaleCookie(locale: AppLocale) {
  const maxAgeSeconds = 60 * 60 * 24 * 365;
  document.cookie = `${LOCALE_COOKIE_NAME}=${locale}; path=/; max-age=${maxAgeSeconds}; samesite=lax`;
}
