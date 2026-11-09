from datetime import UTC, date, datetime, timedelta
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.models import TaxPlannerRuleRevision
from app.modules.wealth.tax_planner_v2.contracts import CurrentCalculationRequest
from app.modules.wealth.tax_planner_v2.golden_cases import golden_cases
from app.modules.wealth.tax_planner_v2.revision_service import RulesError, TaxPlannerRevisionService
from app.modules.wealth.tax_planner_v2.rules import RulePack, income_period
from app.modules.wealth.tax_planner_v2.source_packs import PACK_2026_27, PACK_2027_28


def row(pack, when):
    return TaxPlannerRuleRevision(id=uuid4(), country_code="BD", assessment_year=pack.assessment_year,
        income_period_start=pack.income_period_start, income_period_end=pack.income_period_end,
        payload_schema_version=pack.schema_version, engine_policy_version=pack.engine_policy_version,
        payload=pack.model_dump(mode="json"), content_hash=pack.content_hash(), status="published",
        published_at=when, created_at=when)


class Repository:
    def __init__(self, rows): self.rows = rows
    async def list(self, **kwargs): return self.rows
    async def active(self, year, status): return next((r for r in self.rows if r.assessment_year == year), None)


@pytest.fixture
def service():
    service = TaxPlannerRevisionService(None)
    now = datetime(2026, 11, 5, tzinfo=UTC)
    service.repository = Repository([row(PACK_2026_27, now), row(PACK_2027_28, now + timedelta(seconds=1))])
    return service


async def test_only_latest_admin_publication_is_exposed(service):
    config = await service.current_config(as_of=date(2026, 11, 5), suspended=False)
    assert config.selected.identity.assessment_year == "2027-28"
    assert len(config.supported_years) == 1
    # A deliberately republished earlier pack is also an explicit admin activation.
    service.repository.rows[0].published_at += timedelta(days=1)
    config = await service.current_config(as_of=date(2026, 11, 5), suspended=False)
    assert config.selected.identity.assessment_year == "2026-27"


async def test_current_request_uses_active_rules_and_rejects_stale_revision(service):
    active = service.repository.rows[1]
    payload = golden_cases(PACK_2027_28, str(active.id))[0].request.model_dump(mode="json")
    payload.pop("assessment_year")
    payload.pop("purpose")
    request = CurrentCalculationRequest.model_validate(payload)
    result = await service.calculate_current(request, as_of=date(2026, 11, 5))
    assert result.assessment_year == "2027-28"
    assert result.purpose == "forward_planning"
    with pytest.raises(RulesError, match="active tax rules changed"):
        await service.calculate_current(request.model_copy(update={"expected_ruleset_revision": str(uuid4())}), as_of=date(2026, 11, 5))


@pytest.mark.parametrize("field,value", [("assessment_year", "2026-27"), ("purpose", "historical_comparison")])
def test_public_request_has_no_year_or_historical_mode(field, value):
    payload = golden_cases(PACK_2027_28, "revision")[0].request.model_dump(mode="json")
    payload.pop("assessment_year")
    payload.pop("purpose")
    payload[field] = value
    with pytest.raises(ValidationError): CurrentCalculationRequest.model_validate(payload)


def test_future_year_can_be_configured_without_a_code_year_list():
    values = PACK_2027_28.model_dump()
    start, end = income_period("2028-29")
    values.update(assessment_year="2028-29", income_period_start=start, income_period_end=end, filing_windows=())
    assert RulePack.model_validate(values).assessment_year == "2028-29"


async def test_invalid_active_pack_never_falls_back_to_an_older_year(service):
    service.repository.rows[1].content_hash = "0" * 64
    with pytest.raises(RulesError):
        await service.current_config(as_of=date(2026, 11, 5), suspended=False)
