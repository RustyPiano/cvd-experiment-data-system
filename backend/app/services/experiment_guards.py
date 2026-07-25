from uuid import UUID

from fastapi import HTTPException, status

from app.models.experiment import ExperimentRun, ExperimentStatus
from app.models.user import User, UserRole
from app.repositories.experiment_repository import ExperimentRepository


def get_visible_experiment(
    experiments: ExperimentRepository,
    experiment_id: UUID,
    current_user: User,
    *,
    schema_version: str | None = None,
) -> ExperimentRun:
    """按仓库可见性规则取炉次；不可见与不存在统一返回 404。"""
    experiment = experiments.get_visible_by_id(
        experiment_id,
        current_user=current_user,
        schema_version=schema_version,
    )
    if experiment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Experiment not found")
    return experiment


def get_owned_experiment(
    experiments: ExperimentRepository,
    experiment_id: UUID,
    current_user: User,
    *,
    schema_version: str | None = None,
) -> ExperimentRun:
    """先过可见性，再要求属主；管理员可操作全部可见炉次。"""
    experiment = get_visible_experiment(
        experiments,
        experiment_id,
        current_user,
        schema_version=schema_version,
    )
    if current_user.role != UserRole.ADMIN and experiment.owner_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions",
        )
    return experiment


def get_locked_visible_experiment(
    experiments: ExperimentRepository,
    experiment_id: UUID,
    current_user: User,
    *,
    schema_version: str | None = None,
) -> ExperimentRun:
    """Lock a run row, then re-evaluate the same visibility rule on fresh state."""
    experiment = experiments.get_by_id_for_update(experiment_id)
    if (
        experiment is None
        or (schema_version is not None and experiment.schema_version != schema_version)
        or (
            current_user.role != UserRole.ADMIN
            and experiment.owner_id != current_user.id
            and experiment.status != ExperimentStatus.LOCKED
        )
    ):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Experiment not found",
        )
    return experiment


def ensure_process_editable(experiment: ExperimentRun) -> None:
    """工艺域在 locked/invalid 均只读。"""
    if experiment.status in {ExperimentStatus.LOCKED, ExperimentStatus.INVALID}:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Locked or invalid experiments cannot be edited",
        )


def ensure_results_editable(experiment: ExperimentRun) -> None:
    """结果与样品可后补；作废炉次禁止写入。"""
    if experiment.status == ExperimentStatus.INVALID:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Invalid experiments cannot be edited",
        )


def ensure_files_editable(experiment: ExperimentRun, asset_role: str) -> None:
    """Locked runs allow result evidence only; process evidence remains frozen."""
    locked_writable_roles = {"characterization_file", "direct_observation_file"}
    if experiment.status == ExperimentStatus.INVALID or (
        experiment.status == ExperimentStatus.LOCKED and asset_role not in locked_writable_roles
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Locked or invalid experiments cannot be edited",
        )
