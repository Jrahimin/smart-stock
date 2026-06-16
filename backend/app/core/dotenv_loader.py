from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[2]


def load_backend_dotenv(*, override: bool = False) -> None:
    """Load ``backend/.env`` into ``os.environ`` for CLI scripts and one-off jobs."""
    from dotenv import load_dotenv

    load_dotenv(BACKEND_ROOT / ".env", override=override)
