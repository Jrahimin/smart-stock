from decimal import Decimal
from typing import Any

from app.core.exception_handlers import AppError
from app.core.enums import WealthInsightSeverity
from app.modules.wealth.formulas.financial_formulas import (
    calculate_future_value_annuity,
    calculate_inflation_adjusted_value,
    calculate_lump_sum_growth,
)
from app.modules.wealth.wealth_assumptions_service import get_country_defaults, resolve_assumption
from app.modules.wealth.wealth_schemas import (
    WealthAssumptionsInput,
    WealthComparisonEvaluateRequest,
    WealthComparisonEvaluateResponse,
    WealthComparisonOptionResult,
    WealthInsightCard,
)

SUPPORTED_COMPARISONS = {
    "dps-vs-fdr",
    "fdr-vs-stocks",
    "save-vs-spend",
    "loan-prepayment-vs-investing",
    "inflation-impact",
}


def _decimal(value: Any, default: Decimal | int | float = 0) -> Decimal:
    return Decimal(str(value if value is not None else default))


class WealthComparisonService:
    def evaluate(self, comparison_slug: str, payload: WealthComparisonEvaluateRequest) -> WealthComparisonEvaluateResponse:
        normalized_slug = comparison_slug.lower().strip()
        if normalized_slug not in SUPPORTED_COMPARISONS:
            raise AppError(f"Unsupported comparison: {comparison_slug}")

        handler = getattr(self, f"_compare_{normalized_slug.replace('-', '_')}")
        return handler(payload)

    def _compare_dps_vs_fdr(self, payload: WealthComparisonEvaluateRequest) -> WealthComparisonEvaluateResponse:
        assumptions = payload.assumptions
        defaults = get_country_defaults(assumptions.country_code)
        monthly_payment = _decimal(payload.left_inputs.get("monthly_payment"), 10000)
        principal = _decimal(payload.right_inputs.get("principal"), monthly_payment * 12)
        years = _decimal(payload.left_inputs.get("years", payload.right_inputs.get("years")), 5)
        dps_rate = resolve_assumption(
            country_code=assumptions.country_code,
            key="dps_rate",
            override=payload.left_inputs.get("annual_rate") or assumptions.annual_rate,
        )
        fdr_rate = resolve_assumption(
            country_code=assumptions.country_code,
            key="fdr_rate",
            override=payload.right_inputs.get("annual_rate") or assumptions.annual_rate,
        )
        inflation_rate = resolve_assumption(country_code=assumptions.country_code, key="inflation_rate", override=assumptions.inflation_rate)

        dps_value = calculate_future_value_annuity(monthly_payment, dps_rate, years)
        fdr_value = calculate_lump_sum_growth(principal, fdr_rate, years)
        difference = (dps_value - fdr_value).quantize(Decimal("0.01"))

        return self._build_response(
            slug="dps-vs-fdr",
            title="DPS vs FDR",
            summary="Monthly discipline versus lump-sum certainty is often the real trade-off here.",
            left=WealthComparisonOptionResult(
                key="dps",
                label=defaults.savings_label,
                final_value=dps_value,
                real_value=calculate_inflation_adjusted_value(dps_value, inflation_rate, years),
                liquidity_note="Usually more flexible month to month.",
                behavior_note="Needs consistent monthly saving.",
                risk_note="Return is relatively stable.",
            ),
            right=WealthComparisonOptionResult(
                key="fdr",
                label=defaults.deposit_label,
                final_value=fdr_value,
                real_value=calculate_inflation_adjusted_value(fdr_value, inflation_rate, years),
                liquidity_note="Often locked for the chosen term.",
                behavior_note="Works best when you already have a lump sum.",
                risk_note="Return is relatively predictable.",
            ),
            difference_value=difference,
            insights=[
                WealthInsightCard(
                    id="dps-fdr-behavior",
                    title="Behavior matters",
                    body="The better option may depend less on the rate and more on whether you save monthly or invest a lump sum.",
                    severity=WealthInsightSeverity.INFO,
                )
            ],
        )

    def _compare_fdr_vs_stocks(self, payload: WealthComparisonEvaluateRequest) -> WealthComparisonEvaluateResponse:
        assumptions = payload.assumptions
        defaults = get_country_defaults(assumptions.country_code)
        principal = _decimal(payload.left_inputs.get("principal", payload.right_inputs.get("principal")), 500000)
        years = _decimal(payload.left_inputs.get("years", payload.right_inputs.get("years")), 5)
        fdr_rate = resolve_assumption(
            country_code=assumptions.country_code,
            key="fdr_rate",
            override=payload.left_inputs.get("annual_rate") or assumptions.annual_rate,
        )
        stock_return = resolve_assumption(
            country_code=assumptions.country_code,
            key="stock_return",
            override=payload.right_inputs.get("annual_rate") or assumptions.annual_rate,
        )
        inflation_rate = resolve_assumption(country_code=assumptions.country_code, key="inflation_rate", override=assumptions.inflation_rate)

        fdr_value = calculate_lump_sum_growth(principal, fdr_rate, years)
        stock_value = calculate_lump_sum_growth(principal, stock_return, years)
        difference = (stock_value - fdr_value).quantize(Decimal("0.01"))

        return self._build_response(
            slug="fdr-vs-stocks",
            title="FDR vs Long-term Investing",
            summary="Certainty and liquidity on one side, growth potential and uncertainty on the other.",
            left=WealthComparisonOptionResult(
                key="fdr",
                label=defaults.deposit_label,
                final_value=fdr_value,
                real_value=calculate_inflation_adjusted_value(fdr_value, inflation_rate, years),
                liquidity_note="Often easier to understand and access on maturity.",
                behavior_note="Lower day-to-day attention required.",
                risk_note="Lower uncertainty.",
            ),
            right=WealthComparisonOptionResult(
                key="stocks",
                label="Investing",
                final_value=stock_value,
                real_value=calculate_inflation_adjusted_value(stock_value, inflation_rate, years),
                liquidity_note="Market liquidity can vary.",
                behavior_note="Needs patience through ups and downs.",
                risk_note="Returns are not guaranteed.",
            ),
            difference_value=difference,
            insights=[
                WealthInsightCard(
                    id="fdr-stocks-tradeoff",
                    title="Not just a return comparison",
                    body="Stocks may look stronger on paper, but volatility and emotional discipline matter too.",
                    severity=WealthInsightSeverity.WARNING,
                )
            ],
        )

    def _compare_save_vs_spend(self, payload: WealthComparisonEvaluateRequest) -> WealthComparisonEvaluateResponse:
        assumptions = payload.assumptions
        amount = _decimal(payload.left_inputs.get("amount", payload.right_inputs.get("amount")), 50000)
        years = _decimal(payload.left_inputs.get("years", payload.right_inputs.get("years")), 3)
        annual_rate = resolve_assumption(country_code=assumptions.country_code, key="stock_return", override=assumptions.annual_rate)
        inflation_rate = resolve_assumption(country_code=assumptions.country_code, key="inflation_rate", override=assumptions.inflation_rate)

        saved_value = calculate_lump_sum_growth(amount, annual_rate, years)
        spent_value = Decimal("0")
        difference = saved_value

        return self._build_response(
            slug="save-vs-spend",
            title="Save vs Spend",
            summary="Spending now gives immediate enjoyment. Saving creates future optionality.",
            left=WealthComparisonOptionResult(
                key="save",
                label="Save and grow",
                final_value=saved_value,
                real_value=calculate_inflation_adjusted_value(saved_value, inflation_rate, years),
                liquidity_note="Money stays available for future choices.",
                behavior_note="Requires delaying gratification.",
                risk_note="Investment return is uncertain.",
            ),
            right=WealthComparisonOptionResult(
                key="spend",
                label="Spend now",
                final_value=spent_value,
                real_value=spent_value,
                liquidity_note="Immediate utility, no future balance.",
                behavior_note="No ongoing discipline required.",
                risk_note="Opportunity cost only.",
            ),
            difference_value=difference,
            insights=[
                WealthInsightCard(
                    id="save-spend-opportunity",
                    title="Opportunity cost is real",
                    body=f"In this scenario, spending now could mean giving up about {saved_value:,.0f} later.",
                    severity=WealthInsightSeverity.INFO,
                )
            ],
        )

    def _compare_loan_prepayment_vs_investing(self, payload: WealthComparisonEvaluateRequest) -> WealthComparisonEvaluateResponse:
        assumptions = payload.assumptions
        extra_amount = _decimal(payload.left_inputs.get("extra_amount", payload.right_inputs.get("extra_amount")), 100000)
        loan_rate = _decimal(payload.left_inputs.get("loan_rate", payload.right_inputs.get("loan_rate")), 12)
        years = _decimal(payload.left_inputs.get("years", payload.right_inputs.get("years")), 5)
        invest_return = resolve_assumption(
            country_code=assumptions.country_code,
            key="stock_return",
            override=payload.right_inputs.get("annual_rate") or assumptions.annual_rate,
        )

        prepay_benefit = (calculate_lump_sum_growth(extra_amount, loan_rate, years) - extra_amount).quantize(
            Decimal("0.01")
        )
        invest_gain = (calculate_lump_sum_growth(extra_amount, invest_return, years) - extra_amount).quantize(
            Decimal("0.01")
        )
        difference = (invest_gain - prepay_benefit).quantize(Decimal("0.01"))

        return self._build_response(
            slug="loan-prepayment-vs-investing",
            title="Loan Prepayment vs Investing",
            summary="Prepaying can create a certain benefit through interest avoided. Investing introduces uncertain gain.",
            left=WealthComparisonOptionResult(
                key="prepay",
                label="Interest avoided",
                final_value=prepay_benefit,
                liquidity_note="Cash leaves your hands now.",
                behavior_note="Creates certainty by reducing debt.",
                risk_note="Return is effectively equal to the loan rate.",
            ),
            right=WealthComparisonOptionResult(
                key="invest",
                label="Potential investment gain",
                final_value=invest_gain,
                liquidity_note="Cash may stay more accessible depending on the investment.",
                behavior_note="Needs patience and risk tolerance.",
                risk_note="Outcome is uncertain.",
            ),
            difference_value=difference,
            insights=[
                WealthInsightCard(
                    id="loan-tradeoff",
                    title="Certainty vs upside",
                    body="Prepayment reduces known interest cost. Investing may offer more upside, but not with the same certainty.",
                    severity=WealthInsightSeverity.NEUTRAL,
                )
            ],
        )

    def _compare_inflation_impact(self, payload: WealthComparisonEvaluateRequest) -> WealthComparisonEvaluateResponse:
        assumptions = payload.assumptions
        amount = _decimal(payload.left_inputs.get("amount", payload.right_inputs.get("amount")), 1000000)
        years = _decimal(payload.left_inputs.get("years", payload.right_inputs.get("years")), 10)
        inflation_rate = resolve_assumption(country_code=assumptions.country_code, key="inflation_rate", override=assumptions.inflation_rate)

        nominal = amount
        real = calculate_inflation_adjusted_value(amount, inflation_rate, years)
        difference = (nominal - real).quantize(Decimal("0.01"))

        return self._build_response(
            slug="inflation-impact",
            title="Nominal vs Real Purchasing Power",
            summary="The same number can feel smaller in the future when prices rise.",
            left=WealthComparisonOptionResult(
                key="nominal",
                label="Nominal value",
                final_value=nominal,
                liquidity_note="The headline number stays the same.",
                behavior_note="Easy to understand at face value.",
                risk_note="Can overstate future purchasing power.",
            ),
            right=WealthComparisonOptionResult(
                key="real",
                label="Inflation-adjusted value",
                final_value=real,
                liquidity_note="Shows what the amount may feel like in today's money.",
                behavior_note="Useful for long-term planning.",
                risk_note="Depends on inflation assumptions.",
            ),
            difference_value=difference,
            insights=[
                WealthInsightCard(
                    id="inflation-erosion",
                    title="Purchasing power erodes quietly",
                    body=f"At {inflation_rate}% inflation, {amount:,.0f} may feel closer to {real:,.0f} over {years:g} year(s).",
                    severity=WealthInsightSeverity.WARNING,
                )
            ],
        )

    def _build_response(
        self,
        *,
        slug: str,
        title: str,
        summary: str,
        left: WealthComparisonOptionResult,
        right: WealthComparisonOptionResult,
        difference_value: Decimal,
        insights: list[WealthInsightCard],
    ) -> WealthComparisonEvaluateResponse:
        difference_percent = None
        if left.final_value > 0:
            difference_percent = ((difference_value / left.final_value) * Decimal("100")).quantize(Decimal("0.01"))

        return WealthComparisonEvaluateResponse(
            comparison_slug=slug,
            title=title,
            summary=summary,
            left=left,
            right=right,
            difference_value=difference_value,
            difference_percent=difference_percent,
            insights=insights,
            next_steps=[
                {"label": "Save this comparison", "href": "/wealth/snapshot"},
                {"label": "Explore another comparison", "href": "/wealth"},
            ],
        )
