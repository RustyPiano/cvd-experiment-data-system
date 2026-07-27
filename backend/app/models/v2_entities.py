from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    event,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from app.db.base import Base

if TYPE_CHECKING:
    from sqlalchemy.orm import Mapper


json_payload_type = JSON().with_variant(JSONB(), "postgresql")


class MaterialLot(Base):
    __tablename__ = "material_lots"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    versions: Mapped[list[MaterialLotVersion]] = relationship(
        back_populates="entity",
        cascade="all, delete-orphan",
    )


class MaterialLotVersion(Base):
    __tablename__ = "material_lot_versions"
    __table_args__ = (
        UniqueConstraint("entity_id", "version", name="uq_material_lot_versions_entity_version"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    entity_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("material_lots.id"),
        index=True,
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    lot_category: Mapped[str] = mapped_column(String(64), nullable=False)
    substance_name: Mapped[str] = mapped_column(String(255), nullable=False)
    chemical_formula: Mapped[str] = mapped_column(String(128), nullable=False)
    batch_number: Mapped[str] = mapped_column(String(128), nullable=False)
    attrs: Mapped[dict[str, Any]] = mapped_column(json_payload_type, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    entity: Mapped[MaterialLot] = relationship(back_populates="versions")


class Setup(Base):
    __tablename__ = "setups"
    __table_args__ = (UniqueConstraint("setup_code", name="uq_setups_setup_code"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    setup_code: Mapped[str] = mapped_column(String(128), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    versions: Mapped[list[SetupVersion]] = relationship(
        back_populates="entity",
        cascade="all, delete-orphan",
    )


class SetupVersion(Base):
    __tablename__ = "setup_versions"
    __table_args__ = (
        UniqueConstraint("entity_id", "version", name="uq_setup_versions_entity_version"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    entity_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("setups.id"),
        index=True,
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    setup_code: Mapped[str] = mapped_column(String(128), nullable=False)
    setup_name: Mapped[str] = mapped_column(String(255), nullable=False)
    zone_count: Mapped[int] = mapped_column(Integer, nullable=False)
    orientation: Mapped[str] = mapped_column(String(64), nullable=False)
    coordinate_system: Mapped[str] = mapped_column(Text, nullable=False)
    attrs: Mapped[dict[str, Any]] = mapped_column(json_payload_type, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    entity: Mapped[Setup] = relationship(back_populates="versions")


class Instrument(Base):
    __tablename__ = "instruments"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    versions: Mapped[list[InstrumentVersion]] = relationship(
        back_populates="entity",
        cascade="all, delete-orphan",
    )


class InstrumentVersion(Base):
    __tablename__ = "instrument_versions"
    __table_args__ = (
        UniqueConstraint("entity_id", "version", name="uq_instrument_versions_entity_version"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    entity_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("instruments.id"),
        index=True,
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    instrument_code: Mapped[str] = mapped_column(String(128), nullable=False)
    name_type: Mapped[str] = mapped_column(String(128), nullable=False)
    attrs: Mapped[dict[str, Any]] = mapped_column(json_payload_type, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    entity: Mapped[Instrument] = relationship(back_populates="versions")


def _reject_version_update(mapper: Mapper, connection: object, target: object) -> None:
    del mapper, connection, target
    raise ValueError("v2 entity version rows are immutable; insert a new version instead")


for version_model in (MaterialLotVersion, SetupVersion, InstrumentVersion):
    event.listen(version_model, "before_update", _reject_version_update)
    event.listen(version_model, "before_delete", _reject_version_update)
