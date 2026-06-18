from pydantic import BaseModel, field_validator


class SystemVersionData(BaseModel):
    version: str
    git_sha: str
    build_time: str

    @field_validator("git_sha")
    @classmethod
    def shorten_git_sha(cls, value: str) -> str:
        normalized = value.strip().lower()
        if normalized in {"", "unknown", "local"}:
            return normalized or "unknown"
        if len(normalized) > 7 and all(character in "0123456789abcdef" for character in normalized):
            return normalized[:7]
        return normalized
