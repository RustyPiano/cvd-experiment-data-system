from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.deps import get_current_admin_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.admin_dashboard import DashboardOverview
from app.services.admin_dashboard_service import AdminDashboardService

router = APIRouter(prefix="/api/v1", tags=["admin-dashboard"])
DbSession = Annotated[Session, Depends(get_db)]
CurrentAdminUser = Annotated[User, Depends(get_current_admin_user)]


@router.get("/admin/dashboard/overview", response_model=DashboardOverview)
def get_dashboard_overview(
    db: DbSession,
    _admin: CurrentAdminUser,
    trend_weeks: Annotated[int, Query(ge=1, le=52)] = 12,
    stale_days: Annotated[int, Query(ge=1, le=365)] = 14,
) -> DashboardOverview:
    return AdminDashboardService(db).get_overview(
        trend_weeks=trend_weeks,
        stale_days=stale_days,
    )
