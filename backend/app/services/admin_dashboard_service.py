from datetime import UTC, date, datetime, timedelta

from sqlalchemy.orm import Session

from app.models.experiment import ExperimentStatus
from app.models.user import UserRole
from app.repositories.experiment_repository import ExperimentRepository
from app.repositories.user_repository import UserRepository
from app.schemas.admin_dashboard import (
    DashboardMemberStat,
    DashboardOverview,
    DashboardTotals,
    DashboardTrendPoint,
)


class AdminDashboardService:
    def __init__(self, db: Session) -> None:
        self.experiments = ExperimentRepository(db)
        self.users = UserRepository(db)

    def get_overview(self, *, trend_weeks: int = 12, stale_days: int = 14) -> DashboardOverview:
        now = datetime.now(UTC)
        current_week_start = self._week_start(now)
        trend_start = current_week_start - timedelta(weeks=trend_weeks - 1)
        stale_before = now - timedelta(days=stale_days)

        status_counts = self.experiments.count_by_status()
        totals = DashboardTotals(
            total=sum(status_counts.values()),
            draft=status_counts.get(ExperimentStatus.DRAFT, 0),
            submitted=status_counts.get(ExperimentStatus.SUBMITTED, 0),
            locked=status_counts.get(ExperimentStatus.LOCKED, 0),
            invalid=status_counts.get(ExperimentStatus.INVALID, 0),
            this_week_new=self.experiments.count_created_since(current_week_start),
        )

        stats_by_owner = {
            row.owner_id: row for row in self.experiments.member_record_stats(stale_before)
        }
        # List every active admin/member account (so people who have not started
        # recording still appear with zeroes), plus any owner that already has records
        # even if their account is now inactive or downgraded to viewer. Including those
        # owners keeps the per-member totals reconciled with the global totals card.
        users_by_id = {user.id: user for user in self.users.list_all()}
        member_ids = {
            user_id
            for user_id, user in users_by_id.items()
            if user.is_active and user.role in {UserRole.ADMIN, UserRole.MEMBER}
        }
        member_ids |= set(stats_by_owner.keys())

        members = []
        for user_id in member_ids:
            user = users_by_id.get(user_id)
            if user is None:
                continue
            stat = stats_by_owner.get(user_id)
            members.append(
                DashboardMemberStat(
                    user_id=user.id,
                    name=user.name,
                    email=user.email,
                    role=user.role.value,
                    is_active=user.is_active,
                    total=stat.total if stat is not None else 0,
                    draft=stat.draft if stat is not None else 0,
                    submitted=stat.submitted if stat is not None else 0,
                    locked=stat.locked if stat is not None else 0,
                    invalid=stat.invalid if stat is not None else 0,
                    stale_draft_count=stat.stale_draft_count if stat is not None else 0,
                    last_activity_at=stat.last_activity_at if stat is not None else None,
                )
            )
        members.sort(key=lambda member: (-member.total, member.name.lower(), member.email.lower()))

        trend_counts = {
            self._coerce_date(row.week_start): row.count
            for row in self.experiments.created_count_by_week(since=trend_start)
        }
        trend = []
        for week_index in range(trend_weeks):
            week_start = trend_start.date() + timedelta(weeks=week_index)
            count = trend_counts.get(week_start, 0)
            iso_year, iso_week, _ = week_start.isocalendar()
            trend.append(
                DashboardTrendPoint(
                    period=f"{iso_year}-W{iso_week:02d}",
                    week_start=week_start,
                    count=count,
                )
            )

        return DashboardOverview(totals=totals, members=members, trend=trend)

    def _week_start(self, value: datetime) -> datetime:
        return (value - timedelta(days=value.weekday())).replace(
            hour=0,
            minute=0,
            second=0,
            microsecond=0,
        )

    def _coerce_date(self, value: date | datetime | str) -> date:
        if isinstance(value, datetime):
            return value.date()
        if isinstance(value, date):
            return value
        return date.fromisoformat(value)
