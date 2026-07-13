from decimal import Decimal

from app.core.enums import WealthGoalStatus, WealthInsightSeverity
from app.models import MoneySnapshot, WealthGoal
from app.modules.wealth.wealth_schemas import WealthInsightCard


class WealthGuideService:
    def build_dashboard_insights(
        self,
        *,
        snapshot: MoneySnapshot | None,
        goals: list[WealthGoal],
        net_worth: Decimal,
        total_assets: Decimal,
        total_liabilities: Decimal,
        monthly_savings: Decimal | None,
    ) -> list[WealthInsightCard]:
        insights: list[WealthInsightCard] = []

        if snapshot is None or total_assets == 0:
            insights.append(
                WealthInsightCard(
                    id="snapshot-empty",
                    title="Your picture can grow over time",
                    body="Use any calculator and save what matters. Your Money Snapshot will build itself gradually.",
                    severity=WealthInsightSeverity.INFO,
                    action_label="Explore scenarios",
                    action_href="/wealth",
                )
            )
            return insights

        if monthly_savings and monthly_savings > 0:
            insights.append(
                WealthInsightCard(
                    id="monthly-savings",
                    title="Savings rhythm is visible",
                    body=f"You are currently tracking about {monthly_savings:,.0f}/month in savings capacity.",
                    severity=WealthInsightSeverity.POSITIVE,
                )
            )

        if total_liabilities > 0 and net_worth > 0:
            debt_ratio = (total_liabilities / total_assets * Decimal("100")).quantize(Decimal("0.01"))
            insights.append(
                WealthInsightCard(
                    id="debt-ratio",
                    title="Debt is part of the picture",
                    body=f"Liabilities are about {debt_ratio}% of total assets in this snapshot.",
                    severity=WealthInsightSeverity.NEUTRAL,
                )
            )

        if goals:
            active_goal = next((goal for goal in goals if goal.status == WealthGoalStatus.ACTIVE), goals[0])
            progress = (
                (active_goal.current_amount / active_goal.target_amount * Decimal("100")).quantize(Decimal("0.01"))
                if active_goal.target_amount > 0
                else Decimal("0")
            )
            insights.append(
                WealthInsightCard(
                    id="goal-progress",
                    title=f"Goal in motion: {active_goal.title}",
                    body=f"You are about {progress}% toward this goal in the current snapshot.",
                    severity=WealthInsightSeverity.POSITIVE,
                )
            )

        return insights[:4]

    def get_seasonal_context(self) -> dict[str, str | None]:
        # Active seasonal lens — swap `season_key` when the calendar changes.
        return {
            "season_key": "income_tax_season",
            "title": "Income tax season — get your estimate in order",
            "description": (
                "See how salary, investments, and rebates may shape your return "
                "before deadline pressure kicks in."
            ),
            "featured_tool_slug": "tax-planner",
            "featured_comparison_slug": "save-vs-spend",
            "cta_label": "Open Tax Planner",
            "cta_href": "/wealth/tools/tax-planner",
        }

        # Future: Ramadan / Zakat lens
        # return {
        #     "season_key": "ramadan",
        #     "title": "A calm moment for Zakat and giving",
        #     "description": (
        #         "Use this season to understand eligible wealth, obligations, "
        #         "and what matters most to you."
        #     ),
        #     "featured_tool_slug": "zakat",
        #     "featured_comparison_slug": "save-vs-spend",
        #     "cta_label": "Calculate Zakat",
        #     "cta_href": "/wealth/tools/zakat",
        # }
