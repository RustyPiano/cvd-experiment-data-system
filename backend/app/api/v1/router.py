from fastapi import APIRouter

from app.api.v1.endpoints.auth import router as auth_router
from app.api.v1.endpoints.files import router as files_router
from app.api.v1.endpoints.health import router as health_router
from app.api.v1.endpoints.samples import router as samples_router
from app.api.v1.endpoints.v2 import router as v2_router

api_v1_router = APIRouter()
api_v1_router.include_router(health_router)
api_v1_router.include_router(auth_router)
api_v1_router.include_router(files_router)
api_v1_router.include_router(samples_router)
api_v1_router.include_router(v2_router)
