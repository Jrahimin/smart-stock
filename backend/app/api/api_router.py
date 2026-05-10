from fastapi import APIRouter

from app.api.v1.v1_router import router as v1_router
from app.core.core_config import get_settings

settings = get_settings()

api_router = APIRouter()
api_router.include_router(v1_router, prefix=settings.api_v1_prefix)

