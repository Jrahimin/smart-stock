import React from "react";
import type { AppLocale } from "@/lib/locale/app-locale";

export function QuoteObservationTimes({ quote, locale }: { quote: { source_observed_at?: string | null; batch_fetched_at?: string | null }; locale: AppLocale }) {
  const bn = locale === "bn";
  const format = (value?: string | null) => value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat(bn ? "bn-BD" : "en-GB", { timeZone: "Asia/Dhaka", dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : null;
  const source = format(quote.source_observed_at), fetched = format(quote.batch_fetched_at);
  return <div className="quote-observation-times">
    <small>{source ? `${bn ? "উৎসে পর্যবেক্ষণ" : "Source observed"}: ${source} (Dhaka)` : bn ? "উৎসের দামের যাচাইকৃত সময় পাওয়া যায়নি।" : "Verified source observation time is unavailable."}</small>
    {fetched && <small>{bn ? "তথ্য আনা হয়েছে" : "Retrieved"}: {fetched} (Dhaka)</small>}
    {fetched && !source && <small>{bn ? "তথ্য আনার সময় দামের সময় নয়।" : "Retrieval time is not the quote's source time."}</small>}
  </div>;
}
