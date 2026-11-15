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

export function marketNewsSourceLabel(source?:string) {
  return source === "AMARSTOCK_API" || source === "AMARSTOCK_NEWS_API" ? "AmarStock" : source;
}

export function marketNewsDateLabel(item:{time:string;publicationDate?:string;dateBasis?:string;dateLabel?:string;dateLabelAsOf?:string},locale:AppLocale="en",now=Date.now()) {
  const value=item.dateBasis === "RECORDED_DATE" ? item.time : item.publicationDate ?? item.time;
  const parsed=/^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00+06:00`) : null;
  const absolute=parsed && Number.isFinite(+parsed) ? new Intl.DateTimeFormat(locale === "bn" ? "bn-BD-u-nu-latn":"en-GB",{timeZone:"Asia/Dhaka",day:"numeric",month:"short",year:"numeric"}).format(parsed) : "—";
  if(item.dateBasis === "RECORDED_DATE")return `${locale === "bn"?"রেকর্ড":"Recorded"} · ${absolute}`;
  // Only the server can grant Today. A cached pre-midnight grant expires on
  // read; the existing minute news query/focus lifecycle revalidates open UI.
  const parts=new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Dhaka",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(now);
  const part=(key:string)=>parts.find(value=>value.type===key)?.value;
  const today=`${part("year")}-${part("month")}-${part("day")}`;
  return item.dateBasis === "PUBLICATION" && item.dateLabel === "TODAY" && item.dateLabelAsOf === today && value === today ? (locale === "bn"?"আজ":"Today") : absolute;
}
