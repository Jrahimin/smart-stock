import type { AppLocale } from "@/lib/locale/app-locale";

export function commonTradeDate(values: Array<string | null | undefined>): string | null {
  const first = values[0];
  return first && values.every((value) => value === first) ? first : null;
}

export function shortTradeDate(value: string | null | undefined, locale: AppLocale = "en") {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return value ?? "—";
  const time = new Date(`${value}T00:00:00+06:00`);
  return Number.isFinite(+time) ? new Intl.DateTimeFormat(locale === "bn" ? "bn-BD-u-nu-latn" : "en-GB", { timeZone: "Asia/Dhaka", day: "numeric", month: locale === "bn" ? "long" : "short" }).format(time) : "—";
}
