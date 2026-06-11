from datetime import date, datetime
from uuid import UUID

from sqlalchemy import Date as SqlDate
from sqlalchemy import Integer, String, and_, cast, func, literal, or_, select
from sqlalchemy.orm import Session, selectinload

from app.models.experiment import ExperimentRun, ExperimentStatus
from app.models.setup_methods import ExperimentSetupSnapshot
from app.models.user import User, UserRole

SORTABLE_EXPERIMENT_COLUMNS = {
    "run_code": ExperimentRun.run_code,
    "material_system": ExperimentRun.material_system,
    "experiment_date": ExperimentRun.experiment_date,
    "status": ExperimentRun.status,
    "updated_at": ExperimentRun.updated_at,
}


def _blank(column):
    return or_(column.is_(None), func.trim(column) == "")


def _setup_content_incomplete():
    """Condition for "missing setup" on the dashboard.

    Mirrors the *submit* gate (a usable setup needs a diagram, methods text, and
    a reference / unpublished reason) rather than the unused confirm ceremony —
    `confirmed_at` is never written by the production frontend, so keying the
    metric on it counted every experiment as missing. Assumes the query has
    outer-joined `ExperimentSetupSnapshot`.
    """
    return or_(
        ExperimentSetupSnapshot.id.is_(None),
        ExperimentSetupSnapshot.diagram_file_asset_id.is_(None),
        _blank(ExperimentSetupSnapshot.methods_text_snapshot),
        and_(
            _blank(ExperimentSetupSnapshot.reference_paper_url_snapshot),
            _blank(ExperimentSetupSnapshot.unpublished_reason_snapshot),
        ),
    )


class ExperimentRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def create(self, experiment: ExperimentRun) -> ExperimentRun:
        self.db.add(experiment)
        self.db.flush()
        self.db.refresh(experiment)
        return experiment

    def save(self, experiment: ExperimentRun) -> ExperimentRun:
        self.db.add(experiment)
        self.db.flush()
        self.db.refresh(experiment)
        return experiment

    def get_by_id(self, experiment_id: UUID) -> ExperimentRun | None:
        statement = (
            select(ExperimentRun)
            .options(
                selectinload(ExperimentRun.derived_from_run),
                selectinload(ExperimentRun.owner),
            )
            .where(ExperimentRun.id == experiment_id)
        )
        return self.db.scalar(statement)

    def next_run_code(self, experiment_date: date) -> str:
        year = experiment_date.year
        statement = (
            select(func.count())
            .select_from(ExperimentRun)
            .where(
                ExperimentRun.experiment_date >= date(year, 1, 1),
                ExperimentRun.experiment_date <= date(year, 12, 31),
            )
        )
        count = self.db.scalar(statement) or 0
        return f"CVD-{year}-{count + 1:04d}"

    def list_visible(
        self,
        *,
        current_user: User,
        mine: bool = False,
        status_filters: list[ExperimentStatus] | None = None,
        material_system: str | None = None,
        query_text: str | None = None,
        owner_id: UUID | None = None,
        page: int = 1,
        page_size: int = 20,
        sort_by: str = "updated_at",
        sort_order: str = "desc",
    ) -> tuple[list[ExperimentRun], int]:
        statement = select(ExperimentRun).options(
            selectinload(ExperimentRun.derived_from_run),
            selectinload(ExperimentRun.owner),
        )

        if status_filters is None:
            statement = statement.where(ExperimentRun.status != ExperimentStatus.INVALID)

        if current_user.role == UserRole.ADMIN:
            if mine:
                statement = statement.where(ExperimentRun.owner_id == current_user.id)
        elif current_user.role == UserRole.MEMBER:
            visible_statuses = [ExperimentStatus.SUBMITTED, ExperimentStatus.LOCKED]
            if mine:
                statement = statement.where(ExperimentRun.owner_id == current_user.id)
            else:
                statement = statement.where(
                    or_(
                        ExperimentRun.owner_id == current_user.id,
                        ExperimentRun.status.in_(visible_statuses),
                    )
                )
        else:
            statement = statement.where(
                ExperimentRun.status.in_([ExperimentStatus.SUBMITTED, ExperimentStatus.LOCKED])
            )

        if status_filters is not None:
            statement = statement.where(ExperimentRun.status.in_(status_filters))

        if material_system:
            statement = statement.where(ExperimentRun.material_system == material_system)

        if owner_id is not None:
            statement = statement.where(ExperimentRun.owner_id == owner_id)

        if query_text and query_text.strip():
            pattern = f"%{query_text.strip()}%"
            statement = statement.where(
                or_(
                    ExperimentRun.run_code.ilike(pattern),
                    ExperimentRun.material_system.ilike(pattern),
                    ExperimentRun.objective.ilike(pattern),
                )
            )

        total_statement = select(func.count()).select_from(statement.order_by(None).subquery())
        total = self.db.scalar(total_statement) or 0

        sort_column = SORTABLE_EXPERIMENT_COLUMNS.get(sort_by, ExperimentRun.updated_at)
        primary_sort = sort_column.asc() if sort_order == "asc" else sort_column.desc()
        if sort_by == "material_system":
            primary_sort = primary_sort.nulls_last()

        tie_breakers = [ExperimentRun.created_at.desc(), ExperimentRun.id.asc()]
        if sort_by != "updated_at":
            tie_breakers.insert(0, ExperimentRun.updated_at.desc())

        statement = (
            statement.order_by(primary_sort, *tie_breakers)
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        return list(self.db.scalars(statement).all()), total

    def count_by_status(self) -> dict[ExperimentStatus, int]:
        statement = select(ExperimentRun.status, func.count(ExperimentRun.id)).group_by(
            ExperimentRun.status
        )
        return {status: count for status, count in self.db.execute(statement).all()}

    def count_created_since(self, since: datetime) -> int:
        statement = (
            select(func.count(ExperimentRun.id))
            .select_from(ExperimentRun)
            .where(ExperimentRun.created_at >= since)
        )
        return self.db.scalar(statement) or 0

    def count_missing_setup_methods(self) -> int:
        statement = (
            select(func.count(ExperimentRun.id))
            .select_from(ExperimentRun)
            .outerjoin(
                ExperimentSetupSnapshot,
                ExperimentSetupSnapshot.experiment_run_id == ExperimentRun.id,
            )
            .where(_setup_content_incomplete())
        )
        return self.db.scalar(statement) or 0

    def member_record_stats(self, stale_before: datetime):
        statement = (
            select(
                ExperimentRun.owner_id.label("owner_id"),
                func.count(ExperimentRun.id).label("total"),
                func.count(ExperimentRun.id)
                .filter(ExperimentRun.status == ExperimentStatus.DRAFT)
                .label("draft"),
                func.count(ExperimentRun.id)
                .filter(ExperimentRun.status == ExperimentStatus.SUBMITTED)
                .label("submitted"),
                func.count(ExperimentRun.id)
                .filter(ExperimentRun.status == ExperimentStatus.LOCKED)
                .label("locked"),
                func.count(ExperimentRun.id)
                .filter(ExperimentRun.status == ExperimentStatus.INVALID)
                .label("invalid"),
                func.max(ExperimentRun.updated_at).label("last_activity_at"),
                func.count(ExperimentRun.id)
                .filter(
                    and_(
                        ExperimentRun.status == ExperimentStatus.DRAFT,
                        ExperimentRun.updated_at < stale_before,
                    )
                )
                .label("stale_draft_count"),
                func.count(ExperimentRun.id)
                .filter(_setup_content_incomplete())
                .label("missing_setup_methods"),
            )
            .outerjoin(
                ExperimentSetupSnapshot,
                ExperimentSetupSnapshot.experiment_run_id == ExperimentRun.id,
            )
            .group_by(ExperimentRun.owner_id)
        )
        return self.db.execute(statement).all()

    def created_count_by_week(self, *, since: datetime):
        dialect_name = self.db.get_bind().dialect.name
        if dialect_name == "sqlite":
            weekday = cast(func.strftime("%w", ExperimentRun.created_at), Integer)
            offset_days = (weekday + 6) % 7
            modifier = literal("-") + cast(offset_days, String) + literal(" days")
            week_start = func.date(ExperimentRun.created_at, modifier).label("week_start")
        else:
            # date_trunc on a timestamptz honours the database session time zone; normalise
            # to UTC first so weekly buckets line up with the UTC week boundaries the service
            # generates, regardless of how the session time zone is configured.
            created_at_utc = ExperimentRun.created_at.op("AT TIME ZONE")(literal("UTC"))
            week_start = cast(func.date_trunc("week", created_at_utc), SqlDate).label("week_start")

        statement = (
            select(week_start, func.count(ExperimentRun.id).label("count"))
            .where(
                ExperimentRun.created_at >= since,
                ExperimentRun.status != ExperimentStatus.INVALID,
            )
            .group_by(week_start)
            .order_by(week_start)
        )
        return self.db.execute(statement).all()
