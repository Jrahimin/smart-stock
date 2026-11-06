import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.core.core_config import Settings, get_settings
from app.core.security_config import ANONYMOUS_USER_CONTEXT
from app.modules.wealth.tax_planner_v2.golden_cases import golden_cases
from app.modules.wealth.tax_planner_v2.http_controls import MAX_TAX_BODY_BYTES
from app.modules.wealth.tax_planner_v2.revision_router import get_revision_service, public_router
from app.modules.wealth.tax_planner_v2.source_packs import PACK_2026_27

CALCULATE = "/api/v1/wealth/tax-planner/v2/calculate"


@pytest.fixture
async def client():
    app = FastAPI()
    app.include_router(public_router, prefix="/api/v1")
    app.dependency_overrides[get_settings] = lambda: Settings(
        _env_file=None, tax_planner_v2_release_enabled=True
    )
    app.dependency_overrides[get_revision_service] = object

    @app.middleware("http")
    async def test_auth(request, call_next):
        request.state.user = ANONYMOUS_USER_CONTEXT
        return await call_next(request)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as http:
        yield http


async def test_unsupported_year_is_a_typed_private_error(client):
    payload = golden_cases(PACK_2026_27, "test-revision")[0].request.model_dump(mode="json")
    payload.pop("purpose")
    payload["assessment_year"] = "private-invalid-year"
    response = await client.post(CALCULATE, json=payload)
    assert response.status_code == 422
    assert response.json()["error_code"] == "VALIDATION_ERROR"
    assert response.headers["Cache-Control"] == "no-store"
    assert "private-invalid-year" not in response.text


async def test_malformed_json_does_not_echo_financial_fields(client, caplog):
    response = await client.post(
        CALCULATE,
        content=b'{"private-financial-input": -',
        headers={"Content-Type": "application/json"},
    )
    assert response.status_code == 422
    assert response.headers["Cache-Control"] == "no-store"
    assert "private-financial-input" not in response.text
    assert "private-financial-input" not in caplog.text


async def test_cross_field_validation_returns_actionable_paths_without_private_inputs(
    client, caplog
):
    case = next(case for case in golden_cases(PACK_2026_27, "test-revision") if case.id == "G10")
    payload = case.request.model_dump(mode="json")
    payload.pop("assessment_year")
    payload.pop("purpose")
    payload["credits"][0]["income_id"] = "private-source-nickname"
    response = await client.post(CALCULATE, json=payload)
    assert response.status_code == 422
    assert response.headers["Cache-Control"] == "no-store"
    assert response.json()["details"]["errors"] == [
        {
            "loc": ["body", "credits", 0, "income_id"],
            "type": "tax_credit_source",
            "msg": "Each linked credit must refer to an entered income ID",
        }
    ]
    assert "private-source-nickname" not in response.text + caplog.text

    payload["credits"][0]["income_id"] = payload["income"][0]["id"]
    payload["income"][0]["expenses"] = [
        {
            "id": payload["credits"][0]["id"],
            "kind": "direct_expense",
            "amount": "783812.11",
            "qualification": "yes",
        }
    ]
    duplicate = await client.post(CALCULATE, json=payload)
    assert duplicate.status_code == 422
    assert duplicate.json()["details"]["errors"][0]["type"] == "tax_payment_duplicate"
    assert "783812.11" not in duplicate.text + caplog.text


@pytest.mark.parametrize("streamed", [False, True])
async def test_body_limit_checks_declared_and_streamed_content(client, streamed):
    async def chunks():
        yield b"x" * (MAX_TAX_BODY_BYTES // 2)
        yield b"x" * (MAX_TAX_BODY_BYTES // 2 + 1)

    content = chunks() if streamed else b"x" * (MAX_TAX_BODY_BYTES + 1)
    response = await client.post(
        CALCULATE, content=content, headers={"Content-Type": "application/json"}
    )
    assert response.status_code == 413
    assert response.json()["error_code"] == "TAX_REQUEST_TOO_LARGE"
    assert response.headers["Cache-Control"] == "no-store"
