from typing import Generic, TypeVar

from pydantic import BaseModel
from pydantic.generics import GenericModel

DataT = TypeVar("DataT")


class ApiResponse(GenericModel, Generic[DataT]):
    success: bool
    message: str
    data: DataT | None = None


class ApiErrorResponse(BaseModel):
    success: bool = False
    message: str
    error_code: str
    details: dict[str, object] | None = None


def success_response(
    data: DataT,
    message: str = "Request completed",
) -> ApiResponse[DataT]:
    return ApiResponse(success=True, message=message, data=data)

