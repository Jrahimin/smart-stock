/** Keep established trading terms in English inside Bangla prose. */
export const TRADING_TERMS = {
  "স্টপ লস": "stop loss", "স্টপ-লস": "stop loss", "ট্রেইলিং": "trailing",
  "রেজিস্ট্যান্স": "resistance", "রেসিস্ট্যান্স": "resistance", "সাপোর্ট": "support",
  "ব্রেকআউট": "breakout", "ব্রেকডাউন": "breakdown", "পুলব্যাক": "pullback",
  "মোমেন্টাম": "momentum", "ভলিউম": "volume", "ট্রেন্ড": "trend", "টার্গেট": "target",
  "এন্ট্রি": "entry", "লিকুইডিটি": "liquidity", "ট্রেডিং": "trading", "হোল্ডার": "holder",
  "শর্টলিস্ট": "shortlist", "স্কোর": "score", "সিগন্যাল": "signal",
} as const;

export function latinFinancialDigits(value: string): string {
  return value.replace(/[০-৯]/g, (digit) => String("০১২৩৪৫৬৭৮৯".indexOf(digit)));
}

export function tradingTerms(value: string): string {
  return latinFinancialDigits(Object.entries(TRADING_TERMS).reduce((text, [term, english]) => text.replaceAll(term, english), value));
}
