from __future__ import annotations

from typing import Literal, TypedDict

from app.core.enums import PortfolioAttentionCode, PortfolioAttentionSeverity

AppLocale = Literal["en", "bn"]
DEFAULT_LOCALE: AppLocale = "bn"
SUPPORTED_LOCALES: frozenset[AppLocale] = frozenset({"en", "bn"})


class PortfolioSummaryEmailLanguage(TypedDict):
    html_lang: str
    subject: str
    greeting: str
    intro: str
    known_current_value: str
    known_unrealized_pl: str
    estimated_daily_movement: str
    holdings: str
    needs_attention: str
    no_attention: str
    open_portfolio: str
    footer: str
    portfolio_summary_eyebrow: str
    day_end_snapshot: str
    session_date: str
    severity_high: str
    severity_medium: str
    severity_low: str
    severity_info: str


ATTENTION_LABELS: dict[AppLocale, dict[PortfolioAttentionCode, str]] = {
    "en": {
        PortfolioAttentionCode.SUPPORT_BREAK: "Support break",
        PortfolioAttentionCode.SELL_OR_REDUCE: "SELL or REDUCE signal",
        PortfolioAttentionCode.PRICE_QUALITY: "Stale, suspended, or uncertain price",
        PortfolioAttentionCode.ELEVATED_RISK: "Elevated risk",
        PortfolioAttentionCode.INCOMPLETE_HOLDING: "Incomplete holding information",
        PortfolioAttentionCode.HIGH_CONCENTRATION: "High position concentration",
        PortfolioAttentionCode.WATCH_RESISTANCE: "Approaching resistance",
        PortfolioAttentionCode.UNUSUAL_VOLUME: "Unusual price and volume",
        PortfolioAttentionCode.IMPORTANT_EVENT: "Important company event",
    },
    "bn": {
        PortfolioAttentionCode.SUPPORT_BREAK: "গুরুত্বপূর্ণ support ভেঙেছে",
        PortfolioAttentionCode.SELL_OR_REDUCE: "SELL signal",
        PortfolioAttentionCode.PRICE_QUALITY: "দামের তথ্য পুরোপুরি পরিষ্কার নয়",
        PortfolioAttentionCode.ELEVATED_RISK: "Risk বেড়েছে",
        PortfolioAttentionCode.INCOMPLETE_HOLDING: "Holding-এর কিছু তথ্য বাকি",
        PortfolioAttentionCode.HIGH_CONCENTRATION: "একটি stock-এ বেশি concentration",
        PortfolioAttentionCode.WATCH_RESISTANCE: "Resistance-এর কাছে",
        PortfolioAttentionCode.UNUSUAL_VOLUME: "দাম ও volume-এ অস্বাভাবিক move",
        PortfolioAttentionCode.IMPORTANT_EVENT: "গুরুত্বপূর্ণ company event",
    },
}

EMAIL_LANGUAGE: dict[AppLocale, PortfolioSummaryEmailLanguage] = {
    "en": {
        "html_lang": "en",
        "subject": "Your portfolio at a glance · {date}",
        "greeting": "Hi {name},",
        "intro": (
            "Here is a quick look at where your portfolio stands after the market close on {date}."
        ),
        "known_current_value": "Current portfolio value",
        "known_unrealized_pl": "Unrealized gain / loss",
        "estimated_daily_movement": "Today’s estimated move",
        "holdings": "Holdings",
        "needs_attention": "Worth a closer look",
        "no_attention": (
            "Nothing significant needs your attention today based on the latest available signals."
        ),
        "open_portfolio": "Review My Portfolio",
        "footer": (
            "You are receiving this because daily portfolio emails are turned on. "
            "You can change this anytime from My Portfolio."
        ),
        "portfolio_summary_eyebrow": "Your portfolio today",
        "day_end_snapshot": "{name}, here is your day-end portfolio picture",
        "session_date": "Market session · {date}",
        "severity_high": "Review now",
        "severity_medium": "Keep an eye on",
        "severity_low": "Worth noting",
        "severity_info": "For your information",
    },
    "bn": {
        "html_lang": "bn",
        "subject": "আজ আপনার পোর্টফোলিও কোথায় দাঁড়াল · {date}",
        "greeting": "হ্যালো {name},",
        "intro": (
            "{date}-এর market close-এর পর আপনার portfolio এখন কোথায় আছে, "
            "তার একটা ছোট ও পরিষ্কার ছবি এখানে।"
        ),
        "known_current_value": "বর্তমান portfolio value",
        "known_unrealized_pl": "এখনকার লাভ / ক্ষতি",
        "estimated_daily_movement": "আজকের আনুমানিক move",
        "holdings": "Holdings",
        "needs_attention": "যেগুলো একটু দেখে নেওয়া ভালো",
        "no_attention": (
            "Latest signal অনুযায়ী আজ আলাদা করে নজর দেওয়ার মতো বড় কোনো বিষয় নেই।"
        ),
        "open_portfolio": "My Portfolio দেখুন",
        "footer": (
            "My Portfolio-তে daily email চালু আছে বলে এই summary পাচ্ছেন। "
            "চাইলে Portfolio page থেকে যেকোনো সময় এটি বন্ধ বা পরিবর্তন করতে পারবেন।"
        ),
        "portfolio_summary_eyebrow": "আজকের portfolio picture",
        "day_end_snapshot": "{name}, দিনশেষে আপনার portfolio-র অবস্থা",
        "session_date": "Market session · {date}",
        "severity_high": "এখনই দেখুন",
        "severity_medium": "নজরে রাখুন",
        "severity_low": "জেনে রাখা ভালো",
        "severity_info": "তথ্য হিসেবে",
    },
}

def parse_app_locale(value: str | None) -> AppLocale:
    if value in SUPPORTED_LOCALES:
        return value  # type: ignore[return-value]
    return DEFAULT_LOCALE


def get_portfolio_summary_email_language(locale: str | None) -> PortfolioSummaryEmailLanguage:
    return EMAIL_LANGUAGE[parse_app_locale(locale)]


def attention_label(locale: str | None, code: PortfolioAttentionCode) -> str:
    labels = ATTENTION_LABELS[parse_app_locale(locale)]
    return labels.get(code, code.value.replace("_", " ").title())


def severity_label(locale: str | None, severity: PortfolioAttentionSeverity) -> str:
    language = get_portfolio_summary_email_language(locale)
    mapping = {
        PortfolioAttentionSeverity.HIGH: language["severity_high"],
        PortfolioAttentionSeverity.MEDIUM: language["severity_medium"],
        PortfolioAttentionSeverity.LOW: language["severity_low"],
        PortfolioAttentionSeverity.INFO: language["severity_info"],
    }
    return mapping.get(severity, severity.value.title())
