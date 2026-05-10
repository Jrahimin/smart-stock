### AmarStock API Sources – Sample Data for Mapping

Below are representative API endpoints and trimmed sample responses for designing the stock details ingestion system.

---

## 1. Snapshot / Real-time + Mixed Fundamentals API

**URL**

```
https://www.amarstock.com/data/1981d726120d/{SYMBOL}
```

**Sample (EBL)**

```json
{
    "Scrip": "EBL",
    "FullName": "Eastern Bank PLC.",
    "LastTrade": 27.20,
    "Volume": 7554927,
    "ClosePrice": 27.20,
    "Week1Close": 27.3,
    "Week52Close": 20.9,
    "Week52Range": "20.70 - 28.90",
    "OpenPrice": 27.30,
    "YCP": 27.30,
    "MarketCap": 25143.544,
    "DaysValue": 204.53,
    "LastUpdate": "04/05/2026 01:57",
    "Change": "-0.10",
    "TotalTrade": 1187,
    "AuthorizedCap": 25000,
    "PaidUpCap": 15958.13,
    "TotalSecurities": 1595813388,
    "LastAGMHeld": "20/05/2025",
    "ReserveSurplus": 26999.9,
    "ListingYear": 1993,
    "MarketCategory": "A",
    "Electronic": "Y",
    "ShareHoldingPercentage": "Mar 31, 2026",
    "SponsorDirector": 31.44,
    "Govt": 0,
    "Institute": 40.84,
    "Foreign": 0.67,
    "Public": 27.05,
    "ShareHoldingPercentage1": "Feb 28, 2026",
    "SponsorDirector1": 31.44,
    "Govt1": 0,
    "Institute1": 41.28,
    "Foreign1": 0.67,
    "Public1": 26.61,
    "ShareHoldingPercentage2": "Dec 31, 2024 (year ended)",
    "SponsorDirector2": 30.67,
    "Govt2": 0,
    "Institute2": 44.68,
    "Foreign2": 0.49,
    "Public2": 24.16,
    "PresentOs": "Active",
    "PresentLs": "December 31, 2024",
    "ShortLoan": 0,
    "LongLoan": 77697.71,
    "LatestDividendStatus": null,
    "Address": "100, Gulshan Avenue, Dhaka-1212",
    "Contact": "01814-225335, +8809666777325 Ext. 8630",
    "Email": "sharedepartment@ebl-bd.com",
    "Web": "http://www.ebl.com.bd",
    "Rating": null,
    "ChangePer": -0.37,
    "DayRange": "26.90 - 27.30",
    "EPS": 4.86,
    "AuditedPE": 5.62,
    "UnAuditedPE": 5.22,
    "Q1Eps": 1.14,
    "Q2Eps": 1.23,
    "Q3Eps": 1.46,
    "Q4Eps": 0,
    "NAV": 31.63,
    "NavPrice": 1.16,
    "freefloat": 68.56,
    "YE": "31  Dec",
    "DividentYield": 7.09,
    "news1stdate": "\/Date(1777794300000)\/",
    "news1sttitle": "Spot News",
    "news1stbody": "Trading of the shares of the company will be allowed only in the Spot Market and Block transaction will also be settled as per spot settlement cycle with cum benefit from 04.05.2026 to 05.05.2026 and trading of the shares will remain suspended on record date i.e., 06.05.2026.",
    "news2stdate": "\/Date(1777275900000)\/",
    "news2sttitle": "Emphasis of Matters",
    "news2stbody": "The auditor of the company has given the Emphasis of Matter paragraph in the auditor\u0027s report for the year ended December 31, 2025. To view the details, please visit: https://www.dsebd.org/Auditors_opinion/2025/198.%20Eastern%20Bank%20PLC_2025.pdf",
    "news3stdate": "\/Date(1776749040000)\/",
    "news3sttitle": "Appointment of Managing Director",
    "news3stbody": "The Company has informed that Mr. Hassan O. Rashid has been appointed as Managing Director of the Company with effect from April 19, 2026.",
    "news4stdate": "\/Date(1776312240000)\/",
    "news4sttitle": "Price Limit Open",
    "news4stbody": "There will be no price limit on the trading of the shares of the Company today (16.04.2026) following its corporate declaration.",
    "news5stdate": "\/Date(1776312240000)\/",
    "news5sttitle": "Dividend Declaration",
    "news5stbody": "(Cont. news of EBL): c. Stock Dividend has not been declared from capital reserve or revaluation reserve or any unrealized gain or out of profit earned prior to incorporation of EBL or through reducing paid-up capital or through doing anything so that the post dividend retained earnings become negative or a debit balance. (end)",
    "ma10": "Bullish",
    "ma20": "Bullish",
    "ma50": "Bullish",
    "ma100": "Bullish",
    "ma200": "Bullish",
    "maAVG": "Strong Bullish",
    "ema10": "Bearish",
    "ema20": "Bullish",
    "ema50": "Bullish",
    "ema100": "Bullish",
    "ema200": "Bullish",
    "emaAVG": "Strong Bullish",
    "stockBeta": "0.93"
}
```

**Notes**

* Indexed fields (`SponsorDirector1`, `news2sttitle`) = historical / repeated data
* News fields → map to `market_events`
* EPS/NAV/PE → `valuation_snapshots` or metrics
* Shareholding → `shareholding_snapshot`
* Moving averages → optional indicators

---

## 2. Historical Price API

**URL**

```
https://www.amarstock.com/data/5ee4d332a90e/?scrip=EBL&cycle=Day1&dtFrom=YYYY-MM-DD
```

**Sample**

```json
[
  {
    "Date": "/Date(1683417600000)/",
    "DateEpoch": 1683417600000,
    "DateString": "07/05/2023 00:00:00",

    "Open": 22.24,
    "High": 22.24,
    "Low": 22.24,
    "Close": 22.24,

    "Volume": 31572,
    "Trade": 0,
    "Change": 0
  }
]
```

**Notes**

* Use for **bulk historical backfill (e.g., 3–12 months)**
* Store in `daily_prices`
* Use `DateEpoch` for uniqueness
* Upsert (symbol + date)

---

## 3. Company Financials API (Core Fundamentals Source)

**URL**

```
https://www.amarstock.com/company/2b5e8cfdd75f/?symbol=EBL
```

**Sample (trimmed)**

```json
[
  {
    "k": "Total assets",
    "l": 392187263713,
    "y": 2021,
    "r": "balance-sheet",
    "s": 1
  },
  {
    "k": "NAV",
    "l": 33.17,
    "y": 2021,
    "r": "balance-sheet"
  },
  {
    "k": "Net profit after tax for the year",
    "l": 4800224395,
    "y": 2021,
    "r": "income-statement"
  },
  {
    "k": "EPS",
    "l": 5.03,
    "y": 2021,
    "r": "income-statement"
  },
  {
    "k": "Net cash flow from operating activities (a)",
    "l": 13453399309,
    "y": 2021,
    "r": "cash-flow-statement"
  }
]
```

📄 Full structure reference available here: 

**Field Meaning**

* `k` → metric name
* `l` → value
* `y` → year
* `r` → report type (`balance-sheet`, `income-statement`, `cash-flow-statement`)
* `s` → summary/total flag (1 = important aggregate)

**Notes**

* This is the **primary source for multi-year fundamentals**
* Map into:

  * `financial_metric_definitions`
  * `financial_metric_values`
  * `financial_reports`
* Requires **metric normalization layer (critical)**

---

## Key Instructions for Implementation

* Do NOT use HTML scraping (fully replace previous logic)

* Use all three APIs together:

  1. Snapshot API → current state + quick metrics + news
  2. Historical API → time-series price backfill
  3. Company API → full financial statements (core data)

* Normalize all metrics (no auto-creation of uncontrolled metric codes)

* Handle indexed fields (e.g., `news1st`, `SponsorDirector1`) as arrays

* Convert `/Date(...)\/` to proper datetime

* Use idempotent upsert logic (no duplicates)

---

## Goal

Design a scalable ingestion pipeline that:

* captures maximum structured data per stock
* supports trend analysis (EPS, NAV, cash flow, etc.)
* supports historical price analytics (60+ days)
* enables future signal generation and AI analysis

---

Use these samples strictly as schema references. Do not assume undocumented fields.