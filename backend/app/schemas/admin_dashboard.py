from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel


class DashboardTotals(BaseModel):
    total: int
    draft: int
    submitted: int
    locked: int
    invalid: int
    this_week_new: int
    missing_setup_methods: int


class DashboardMemberStat(BaseModel):
    user_id: UUID
    name: str
    email: str
    role: str
    is_active: bool
    total: int
    draft: int
    submitted: int
    locked: int
    invalid: int
    stale_draft_count: int
    missing_setup_methods: int
    last_activity_at: datetime | None


class DashboardTrendPoint(BaseModel):
    period: str
    week_start: date
    count: int


class DashboardOverview(BaseModel):
    totals: DashboardTotals
    members: list[DashboardMemberStat]
    trend: list[DashboardTrendPoint]
