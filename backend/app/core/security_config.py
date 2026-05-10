from pydantic import BaseModel, Field


class UserContext(BaseModel):
    user_id: str
    display_name: str
    is_authenticated: bool = False
    roles: list[str] = Field(default_factory=list)


ANONYMOUS_USER_CONTEXT = UserContext(
    user_id="anonymous",
    display_name="Anonymous User",
    is_authenticated=False,
    roles=[],
)


PLACEHOLDER_AUTHENTICATED_USER_CONTEXT = UserContext(
    user_id="placeholder-user",
    display_name="Placeholder User",
    is_authenticated=True,
    roles=["user"],
)

