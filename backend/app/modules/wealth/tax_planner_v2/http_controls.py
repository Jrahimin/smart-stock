"""Keep tax planning requests and validation errors out of general request logs."""

import logging
from collections.abc import Awaitable, Callable
from typing import Annotated

from fastapi import Depends, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, Response
from fastapi.routing import APIRoute
from sqlalchemy.exc import SQLAlchemyError
from starlette.exceptions import HTTPException
from starlette.requests import ClientDisconnect

from app.core.core_config import Settings, get_settings
from app.core.database_session import recycle_pool_after_poisoned_connection
from app.core.exception_handlers import AppError
from app.core.response_handler import ApiErrorResponse

from .revision_service import RulesError, unavailable, unsupported_year
from .validation_issues import ISSUE_MESSAGES

logger = logging.getLogger(__name__)
MAX_TAX_BODY_BYTES = 256 * 1024
TaxSettings = Annotated[Settings, Depends(get_settings)]

_MESSAGES = {
    "missing": "This field is required",
    "extra_forbidden": "Unexpected input field",
    "json_invalid": "Invalid JSON body",
    "literal_error": "Select a supported value",
    "union_tag_invalid": "Select a supported input type",
    "union_tag_not_found": "Specify the input type",
    "too_long": "Value exceeds the allowed length",
    "greater_than_equal": "Amount is below the allowed limit",
    "less_than_equal": "Amount exceeds the allowed limit",
    "bool_type": "Select Yes or No",
    "int_type": "Enter a whole number",
    "string_pattern_mismatch": "Use the format shown for this field",
}


def require_public_v2(settings: TaxSettings) -> None:
    if not settings.tax_planner_v2_release_enabled:
        raise unavailable()


def require_legacy_tax_planner(settings: TaxSettings) -> None:
    if settings.tax_planner_v2_release_enabled:
        raise RulesError(
            410,
            "TAX_PLANNER_UPGRADE_REQUIRED",
            "Refresh the tax planner to use the current assessment-year experience.",
        )


def _error(status: int, code: str, message: str, details: dict | None = None) -> JSONResponse:
    return JSONResponse(
        status_code=status,
        content=ApiErrorResponse(
            error_code=code,
            message=message,
            details=details,
        ).model_dump(mode="json", exclude_none=True),
        headers={"Cache-Control": "no-store"},
    )


def _validation_error(exc: RequestValidationError) -> JSONResponse:
    errors = []
    year_error = False
    for item in exc.errors():
        location = tuple(item["loc"])
        kind = item["type"]
        if location == ("body", "assessment_year") and kind == "literal_error":
            year_error = True
        # Unknown field names can themselves contain financial data or secrets.
        if kind == "extra_forbidden":
            location = location[:-1]
        if kind in ISSUE_MESSAGES:
            location += tuple(item.get("ctx", {}).get("tax_path", ()))
        errors.append(
            {
                "loc": location,
                "type": kind,
                "msg": ISSUE_MESSAGES.get(
                    kind, _MESSAGES.get(kind, "Invalid value or incompatible facts for this field")
                ),
            }
        )
    logger.info("Tax planner validation failed field_error_count=%s", len(errors))
    if year_error and len(errors) == 1:
        error = unsupported_year()
        return _error(error.status_code, error.error_code, error.message, error.details)
    return _error(422, "VALIDATION_ERROR", "Request validation failed", {"errors": errors})


async def _bounded_request(request: Request) -> Request:
    if request.method not in {"POST", "PUT", "PATCH"}:
        return request
    length = request.headers.get("content-length")
    if length is not None:
        try:
            declared_size = int(length)
        except ValueError:
            raise RulesError(400, "INVALID_CONTENT_LENGTH", "Invalid request length") from None
        if declared_size < 0:
            raise RulesError(400, "INVALID_CONTENT_LENGTH", "Invalid request length")
        if declared_size > MAX_TAX_BODY_BYTES:
            raise RulesError(413, "TAX_REQUEST_TOO_LARGE", "Tax planner request is too large")
    body = bytearray()
    async for chunk in request.stream():
        if len(body) + len(chunk) > MAX_TAX_BODY_BYTES:
            raise RulesError(413, "TAX_REQUEST_TOO_LARGE", "Tax planner request is too large")
        body.extend(chunk)

    async def receive():
        return {"type": "http.request", "body": bytes(body), "more_body": False}

    return Request(request.scope, receive=receive)


class TaxPlannerRoute(APIRoute):
    def get_route_handler(self) -> Callable[[Request], Awaitable[Response]]:
        handle = super().get_route_handler()

        async def secure(request: Request) -> Response:
            try:
                response = await handle(await _bounded_request(request))
            except RequestValidationError as exc:
                return _validation_error(exc)
            except AppError as exc:
                return _error(exc.status_code, exc.error_code, exc.message, exc.details)
            except (HTTPException, ClientDisconnect) as exc:
                status = exc.status_code if isinstance(exc, HTTPException) else 400
                return _error(
                    status, "TAX_REQUEST_FAILED", "The tax planner request could not be processed"
                )
            except SQLAlchemyError as exc:
                logger.error("Tax planner database failure type=%s", type(exc).__name__)
                await recycle_pool_after_poisoned_connection(exc)
                return _error(
                    503, "TAX_RULES_UNAVAILABLE", "The tax planner database is unavailable"
                )
            except Exception as exc:
                logger.error("Tax planner request failure type=%s", type(exc).__name__)
                return _error(
                    500, "INTERNAL_SERVER_ERROR", "An unexpected tax planner error occurred"
                )
            response.headers["Cache-Control"] = "no-store"
            return response

        return secure
