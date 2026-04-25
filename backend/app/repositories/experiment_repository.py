from datetime import date
from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.models.experiment import ExperimentRun, ExperimentStatus
from app.models.user import User, UserRole

SORTABLE_EXPERIMENT_COLUMNS = {
    "run_code": ExperimentRun.run_code,
    "material_system": ExperimentRun.material_system,
    "experiment_date": ExperimentRun.experiment_date,
    "status": ExperimentRun.status,
    "updated_at": ExperimentRun.updated_at,
}


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
            .options(selectinload(ExperimentRun.derived_from_run))
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
        page: int = 1,
        page_size: int = 20,
        sort_by: str = "updated_at",
        sort_order: str = "desc",
    ) -> tuple[list[ExperimentRun], int]:
        statement = select(ExperimentRun).options(selectinload(ExperimentRun.derived_from_run))

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
