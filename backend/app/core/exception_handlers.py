from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError

from app.core.logging_config import get_logger
from app.core.response_handler import ApiErrorResponse

logger = get_logger(__name__)


class AppError(Exception):
    status_code = status.HTTP_400_BAD_REQUEST
    error_code = "APP_ERROR"
    message = "Application error"

    def __init__(
        self,
        message: str | None = None,
        *,
        error_code: str | None = None,
        details: dict[str, object] | None = None,
    ) -> None:
        self.message = message or self.message
        self.error_code = error_code or self.error_code
        self.details = details
        super().__init__(self.message)


class NotFoundError(AppError):
    status_code = status.HTTP_404_NOT_FOUND
    error_code = "NOT_FOUND"
    message = "Resource was not found"


class UnauthorizedError(AppError):
    status_code = status.HTTP_401_UNAUTHORIZED
    error_code = "UNAUTHORIZED"
    message = "Authentication is required"


class ForbiddenError(AppError):
    status_code = status.HTTP_403_FORBIDDEN
    error_code = "FORBIDDEN"
    message = "You do not have permission to perform this action"


def _error_payload(
    *,
    message: str,
    error_code: str,
    details: dict[str, object] | None = None,
) -> dict[str, object]:
    return ApiErrorResponse(
        message=message,
        error_code=error_code,
        details=details,
    ).model_dump(exclude_none=True)


async def app_error_handler(_: Request, exc: AppError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content=_error_payload(
            message=exc.message,
            error_code=exc.error_code,
            details=exc.details,
        ),
    )


async def validation_error_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
    logger.info("Request validation failed", exc_info=exc)
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content=_error_payload(
            message="Request validation failed",
            error_code="VALIDATION_ERROR",
            details={"errors": exc.errors()},
        ),
    )


async def database_error_handler(_: Request, exc: SQLAlchemyError) -> JSONResponse:
    logger.exception("Database operation failed", exc_info=exc)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content=_error_payload(
            message="A database error occurred",
            error_code="DATABASE_ERROR",
        ),
    )


async def unhandled_exception_handler(_: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled application error", exc_info=exc)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content=_error_payload(
            message="An unexpected error occurred",
            error_code="INTERNAL_SERVER_ERROR",
        ),
    )


def register_exception_handlers(app: FastAPI) -> None:
    app.add_exception_handler(AppError, app_error_handler)
    app.add_exception_handler(RequestValidationError, validation_error_handler)
    app.add_exception_handler(SQLAlchemyError, database_error_handler)
    app.add_exception_handler(Exception, unhandled_exception_handler)

