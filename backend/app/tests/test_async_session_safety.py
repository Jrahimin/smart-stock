from pathlib import Path

from app.core.database_session import is_poisoned_connection_error

BACKEND_ROOT = Path(__file__).resolve().parents[1]
REQUEST_SESSION_SERVICES = (
    BACKEND_ROOT / "modules" / "stock_details" / "stock_details_workspace_service.py",
    BACKEND_ROOT / "modules" / "stock_details" / "stock_details_decision_service.py",
    BACKEND_ROOT / "modules" / "stock_details" / "sector_intelligence_service.py",
    BACKEND_ROOT / "modules" / "watchlists" / "watchlists_service.py",
    BACKEND_ROOT / "modules" / "portfolios" / "portfolios_service.py",
)


def test_detects_asyncpg_nested_transaction_error() -> None:
    inner = RuntimeError(
        "cannot use Connection.transaction() in a manually started transaction"
    )
    wrapped = RuntimeError("Database operation failed")
    wrapped.__cause__ = inner
    assert is_poisoned_connection_error(wrapped) is True
    assert is_poisoned_connection_error(inner) is True


def test_detects_sqlalchemy_concurrent_session_error() -> None:
    error = RuntimeError(
        "This session is provisioning a new connection; concurrent operations are not permitted"
    )
    assert is_poisoned_connection_error(error) is True


def test_ignores_ordinary_database_errors() -> None:
    assert is_poisoned_connection_error(RuntimeError("connection timed out")) is False


def test_request_services_do_not_gather_on_shared_session() -> None:
    offenders: list[str] = []
    for path in REQUEST_SESSION_SERVICES:
        source = path.read_text(encoding="utf-8")
        if "asyncio.gather" in source:
            offenders.append(str(path.relative_to(BACKEND_ROOT.parent)))
    assert offenders == []
