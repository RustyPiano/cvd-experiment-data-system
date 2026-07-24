from datetime import date
from uuid import UUID

from sqlalchemy import Uuid, bindparam, exists, func, or_, select, text
from sqlalchemy.orm import Session, selectinload

from app.models.experiment import ExperimentRun, ExperimentStatus
from app.models.module_payload import ExperimentModulePayload
from app.models.user import User, UserRole

SORTABLE_EXPERIMENT_COLUMNS = {
    "run_code": ExperimentRun.run_code,
    "material_system": ExperimentRun.material_system,
    "experiment_date": ExperimentRun.experiment_date,
    "status": ExperimentRun.status,
    "updated_at": ExperimentRun.updated_at,
}


def _visibility_clause(current_user: User):
    if current_user.role == UserRole.ADMIN:
        return None
    return or_(
        ExperimentRun.owner_id == current_user.id,
        ExperimentRun.status == ExperimentStatus.LOCKED,
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
                selectinload(ExperimentRun.owner),
                selectinload(ExperimentRun.module_payloads),
            )
            .where(ExperimentRun.id == experiment_id)
        )
        return self.db.scalar(statement)

    def get_by_id_for_update(self, experiment_id: UUID) -> ExperimentRun | None:
        """Lock a run row for a state/result write and refresh any stale identity-map value."""
        if self.db.get_bind().dialect.name == "sqlite":
            self.db.execute(
                text("UPDATE experiment_runs SET id = id WHERE id = :id").bindparams(
                    bindparam("id", type_=Uuid(as_uuid=True))
                ),
                {"id": experiment_id},
            )
        statement = (
            select(ExperimentRun)
            .options(
                selectinload(ExperimentRun.owner),
                selectinload(ExperimentRun.module_payloads),
            )
            .where(ExperimentRun.id == experiment_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        return self.db.scalar(statement)

    def get_visible_by_id(
        self,
        experiment_id: UUID,
        *,
        current_user: User,
        schema_version: str | None = None,
    ) -> ExperimentRun | None:
        statement = (
            select(ExperimentRun)
            .options(
                selectinload(ExperimentRun.owner),
                selectinload(ExperimentRun.module_payloads),
            )
            .where(ExperimentRun.id == experiment_id)
        )
        visibility = _visibility_clause(current_user)
        if visibility is not None:
            statement = statement.where(visibility)
        if schema_version is not None:
            statement = statement.where(ExperimentRun.schema_version == schema_version)
        return self.db.scalar(statement)

    def next_run_code(self, experiment_date: date) -> str:
        year = experiment_date.year
        prefix = f"CVD-{year}-"
        codes = self.db.scalars(
            select(ExperimentRun.run_code).where(ExperimentRun.run_code.like(f"{prefix}%"))
        )
        suffixes = [
            int(suffix)
            for code in codes
            if code.startswith(prefix)
            and len(suffix := code.removeprefix(prefix)) == 4
            and suffix.isdigit()
        ]
        sequence = max(suffixes, default=0) + 1
        if sequence > 9999:
            raise ValueError(f"Run code sequence exhausted for {year}")
        return f"{prefix}{sequence:04d}"

    def list_visible(
        self,
        *,
        current_user: User,
        mine: bool = False,
        status_filters: list[ExperimentStatus] | None = None,
        material_system: str | None = None,
        query_text: str | None = None,
        operator: str | None = None,
        owner_id: UUID | None = None,
        date_from: date | None = None,
        date_to: date | None = None,
        page: int = 1,
        page_size: int = 20,
        sort_by: str = "updated_at",
        sort_order: str = "desc",
        schema_version: str | None = None,
    ) -> tuple[list[ExperimentRun], int]:
        statement = select(ExperimentRun).options(
            selectinload(ExperimentRun.owner),
            selectinload(ExperimentRun.module_payloads),
        )

        if schema_version is not None:
            statement = statement.where(ExperimentRun.schema_version == schema_version)

        visibility = _visibility_clause(current_user)
        if visibility is None:
            if mine:
                statement = statement.where(ExperimentRun.owner_id == current_user.id)
        else:
            if mine:
                statement = statement.where(ExperimentRun.owner_id == current_user.id)
            else:
                statement = statement.where(visibility)

        if status_filters is not None:
            statement = statement.where(ExperimentRun.status.in_(status_filters))

        if material_system and material_system.strip():
            statement = statement.where(
                ExperimentRun.material_system.ilike(f"%{material_system.strip()}%")
            )

        if operator and operator.strip():
            operator_pattern = f"%{operator.strip()}%"
            statement = statement.where(
                exists(
                    select(ExperimentModulePayload.id).where(
                        ExperimentModulePayload.experiment_run_id == ExperimentRun.id,
                        ExperimentModulePayload.module_key == "basic_info",
                        ExperimentModulePayload.payload_json["operator"]
                        .as_string()
                        .ilike(operator_pattern),
                    )
                )
            )

        if date_from is not None:
            statement = statement.where(ExperimentRun.experiment_date >= date_from)
        if date_to is not None:
            statement = statement.where(ExperimentRun.experiment_date <= date_to)

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
