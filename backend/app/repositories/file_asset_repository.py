from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models.experiment import ExperimentRun, ExperimentStatus
from app.models.file_asset import FileAsset
from app.models.user import User, UserRole


class FileAssetRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def create(self, file_asset: FileAsset) -> FileAsset:
        self.db.add(file_asset)
        self.db.flush()
        self.db.refresh(file_asset)
        return file_asset

    def save(self, file_asset: FileAsset) -> FileAsset:
        self.db.add(file_asset)
        self.db.flush()
        self.db.refresh(file_asset)
        return file_asset

    def get_by_id(self, file_id: UUID) -> FileAsset | None:
        statement = select(FileAsset).where(FileAsset.id == file_id)
        return self.db.scalar(statement)

    def exists_for_sample(self, sample_id: UUID) -> bool:
        statement = select(FileAsset.id).where(FileAsset.sample_id == sample_id).limit(1)
        return self.db.scalar(statement) is not None

    def list_visible(
        self,
        *,
        current_user: User,
        experiment_id: UUID | None = None,
        sample_id: UUID | None = None,
        method: str | None = None,
        file_category: str | None = None,
    ) -> list[FileAsset]:
        statement = (
            select(FileAsset)
            .join(ExperimentRun, FileAsset.experiment_run_id == ExperimentRun.id)
            .where(FileAsset.deleted_at.is_(None))
        )

        if current_user.role == UserRole.ADMIN:
            pass
        elif current_user.role == UserRole.MEMBER:
            statement = statement.where(
                or_(
                    ExperimentRun.owner_id == current_user.id,
                    ExperimentRun.status.in_([ExperimentStatus.SUBMITTED, ExperimentStatus.LOCKED]),
                )
            )
        else:
            statement = statement.where(
                ExperimentRun.status.in_([ExperimentStatus.SUBMITTED, ExperimentStatus.LOCKED])
            )

        if experiment_id is not None:
            statement = statement.where(FileAsset.experiment_run_id == experiment_id)
        if sample_id is not None:
            statement = statement.where(FileAsset.sample_id == sample_id)
        if method:
            statement = statement.where(FileAsset.method == method)
        if file_category:
            statement = statement.where(FileAsset.file_category == file_category)

        statement = statement.order_by(FileAsset.created_at.desc(), FileAsset.original_name.asc())
        return list(self.db.scalars(statement).all())

    def list_by_experiment(self, experiment_id: UUID) -> list[FileAsset]:
        statement = (
            select(FileAsset)
            .where(
                FileAsset.experiment_run_id == experiment_id,
                FileAsset.deleted_at.is_(None),
            )
            .order_by(FileAsset.created_at.asc(), FileAsset.original_name.asc())
        )
        return list(self.db.scalars(statement).all())

    def find_active_duplicate(self, experiment_id: UUID, sha256: str) -> FileAsset | None:
        statement = select(FileAsset).where(
            FileAsset.experiment_run_id == experiment_id,
            FileAsset.sha256 == sha256,
            FileAsset.deleted_at.is_(None),
        )
        return self.db.scalar(statement)
