from pydantic import BaseModel, Field


class UserContext(BaseModel):
    user_id: str
    display_name: str
    email: str | None = None
    is_authenticated: bool = False
    roles: list[str] = Field(default_factory=list)
    session_id: str | None = None


ANONYMOUS_USER_CONTEXT = UserContext(
    user_id="anonymous",
    display_name="Anonymous User",
    email=None,
    is_authenticated=False,
    roles=[],
)

