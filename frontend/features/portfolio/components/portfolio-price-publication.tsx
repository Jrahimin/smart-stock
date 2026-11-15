import type { BackendDisplayQuoteDto, PortfolioPriceStatus } from "@/lib/api/backend-api-types";
import type { AppLocale } from "@/lib/locale/app-locale";
import { portfolioPriceStatusLabel } from "../view-models/portfolio-view-model";

/** Render trading/quality restrictions without quote freshness metadata. */
export function PortfolioPricePublication({ item, locale }: {
  item: { current_price: string | number | null; latest_trade_date?: string | null; price_status?: PortfolioPriceStatus | null; mark_authority?: string | null; display_quote?: BackendDisplayQuoteDto | null };
  locale: AppLocale;
}) {
  const label=portfolioPriceStatusLabel(item,locale);
  return label ? <small>{label}</small> : null;
}
