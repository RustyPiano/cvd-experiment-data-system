from __future__ import annotations

import uuid
from datetime import datetime
from enum import StrEnum
from typing import TYPE_CHECKING

from sqlalchemy import JSON, DateTime, ForeignKey, String, Text, UniqueConstraint, Uuid, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.experiment import ExperimentRun

MODULE_PAYLOAD_SCHEMA_VERSION = "cvd_v1"


class ExperimentModuleKey(StrEnum):
    BASIC_INFO = "basic_info"
    ENVIRONMENT = "environment"
    PRECHECK = "precheck"
    PRECURSORS = "precursors"
    SUBSTRATES = "substrates"
    FURNACE_PROGRAM = "furnace_program"
    GAS_PROGRAM = "gas_program"
    PROCESS_OBSERVATION = "process_observation"
    CHARACTERIZATION = "characterization"
    RESULT_SUMMARY = "result_summary"


json_payload_type = JSON().with_variant(JSONB(), "postgresql")


class ExperimentModulePayload(Base):
    __tablename__ = "experiment_module_payloads"
    __table_args__ = (
        UniqueConstraint("experiment_run_id", "module_key", name="uq_module_payload_run_key"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    experiment_run_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("experiment_runs.id"),
        index=True,
    )
    module_key: Mapped[str] = mapped_column(String(64), nullable=False)
    schema_version: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        default=MODULE_PAYLOAD_SCHEMA_VERSION,
    )
    payload_json: Mapped[dict] = mapped_column(
        json_payload_type,
        nullable=False,
        default=dict,
    )
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    experiment_run: Mapped[ExperimentRun] = relationship(back_populates="module_payloads")
