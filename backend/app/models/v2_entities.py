from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
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


class Substance(Base):
    __tablename__ = "substances"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    canonical_name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    chemical_formula: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    synonyms: Mapped[list[str]] = mapped_column(json_payload_type, nullable=False, default=list)
    identifiers: Mapped[list[dict[str, Any]]] = mapped_column(
        json_payload_type,
        nullable=False,
        default=list,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )


class CommercialProduct(Base):
    __tablename__ = "commercial_products"
    __table_args__ = (
        UniqueConstraint(
            "supplier",
            "catalog_number",
            name="uq_commercial_products_supplier_catalog",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    substance_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("substances.id"),
        nullable=True,
        index=True,
    )
    supplier: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    catalog_number: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    declared_grade: Mapped[str | None] = mapped_column(String(128), nullable=True)
    specification_json: Mapped[dict[str, Any]] = mapped_column(
        json_payload_type,
        nullable=False,
        default=dict,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )


class MaterialLot(Base):
    __tablename__ = "material_lots"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    substance_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("substances.id"),
        nullable=True,
        index=True,
    )
    commercial_product_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("commercial_products.id"),
        nullable=True,
        index=True,
    )
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
    containers: Mapped[list[ContainerInstance]] = relationship(
        back_populates="material_lot",
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
    chemical_formula: Mapped[str | None] = mapped_column(String(128), nullable=True)
    batch_number: Mapped[str | None] = mapped_column(String(128), nullable=True)
    attrs: Mapped[dict[str, Any]] = mapped_column(json_payload_type, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    entity: Mapped[MaterialLot] = relationship(back_populates="versions")


class ContainerInstance(Base):
    __tablename__ = "container_instances"
    __table_args__ = (
        UniqueConstraint("container_code", name="uq_container_instances_code"),
        CheckConstraint(
            "remaining_amount IS NULL OR remaining_amount >= 0",
            name="ck_container_instances_remaining_amount",
        ),
        CheckConstraint(
            "status IN ('available', 'in_use', 'empty', 'quarantined', 'disposed')",
            name="ck_container_instances_status",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    material_lot_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("material_lots.id"),
        nullable=False,
        index=True,
    )
    container_code: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    container_type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    opened_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    storage_history: Mapped[list[dict[str, Any]]] = mapped_column(
        json_payload_type,
        nullable=False,
        default=list,
    )
    remaining_amount: Mapped[float | None] = mapped_column(Float, nullable=True)
    remaining_unit: Mapped[str | None] = mapped_column(String(32), nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="available", index=True)
    attrs: Mapped[dict[str, Any]] = mapped_column(json_payload_type, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    material_lot: Mapped[MaterialLot] = relationship(back_populates="containers")


class SubstrateStack(Base):
    __tablename__ = "substrate_stacks"
    __table_args__ = (
        UniqueConstraint(
            "material_lot_version_id",
            name="uq_substrate_stacks_material_lot_version",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    material_lot_version_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("material_lot_versions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    top_surface: Mapped[str | None] = mapped_column(String(128), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class SubstrateLayer(Base):
    __tablename__ = "substrate_layers"
    __table_args__ = (
        UniqueConstraint(
            "substrate_stack_id",
            "layer_index",
            name="uq_substrate_layers_stack_index",
        ),
        CheckConstraint("layer_index >= 1", name="ck_substrate_layers_index_positive"),
        CheckConstraint(
            "thickness_nm IS NULL OR thickness_nm > 0",
            name="ck_substrate_layers_thickness_positive",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    substrate_stack_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("substrate_stacks.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    layer_index: Mapped[int] = mapped_column(Integer, nullable=False)
    material_name: Mapped[str] = mapped_column(String(255), nullable=False)
    chemical_formula: Mapped[str | None] = mapped_column(String(128), nullable=True)
    thickness_nm: Mapped[float | None] = mapped_column(Float, nullable=True)
    orientation: Mapped[str | None] = mapped_column(String(128), nullable=True)
    supplier_lot_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("material_lots.id"),
        nullable=True,
        index=True,
    )


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


class EquipmentComponentInstance(Base):
    __tablename__ = "equipment_component_instances"
    __table_args__ = (UniqueConstraint("component_code", name="uq_equipment_components_code"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    component_code: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    component_type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    manufacturer: Mapped[str | None] = mapped_column(String(255), nullable=True)
    model: Mapped[str | None] = mapped_column(String(128), nullable=True)
    serial_number: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    attrs: Mapped[dict[str, Any]] = mapped_column(json_payload_type, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )


class SetupVersionComponent(Base):
    __tablename__ = "setup_version_components"
    __table_args__ = (
        UniqueConstraint(
            "setup_version_id",
            "component_id",
            "role",
            name="uq_setup_version_components_binding",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    setup_version_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("setup_versions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    component_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("equipment_component_instances.id"),
        nullable=False,
        index=True,
    )
    role: Mapped[str] = mapped_column(String(64), nullable=False)
    position_json: Mapped[dict[str, Any] | None] = mapped_column(
        json_payload_type,
        nullable=True,
    )


class EquipmentLifecycleEvent(Base):
    __tablename__ = "equipment_lifecycle_events"
    __table_args__ = (
        CheckConstraint(
            "event_type IN ('install', 'remove', 'calibration', 'maintenance')",
            name="ck_equipment_lifecycle_events_type",
        ),
        Index("ix_equipment_events_component_time", "component_id", "occurred_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    component_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("equipment_component_instances.id"),
        nullable=False,
        index=True,
    )
    event_type: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    valid_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    quantity: Mapped[str | None] = mapped_column(String(128), nullable=True)
    correction: Mapped[float | None] = mapped_column(Float, nullable=True)
    expanded_uncertainty: Mapped[float | None] = mapped_column(Float, nullable=True)
    details_json: Mapped[dict[str, Any]] = mapped_column(
        json_payload_type,
        nullable=False,
        default=dict,
    )
    certificate_file_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("file_assets.id"),
        nullable=True,
        index=True,
    )


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


class InstrumentCapability(Base):
    __tablename__ = "instrument_capabilities"
    __table_args__ = (
        UniqueConstraint(
            "instrument_version_id",
            "capability_code",
            name="uq_instrument_capabilities_version_code",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    instrument_version_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("instrument_versions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    capability_code: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    configuration_json: Mapped[dict[str, Any]] = mapped_column(
        json_payload_type,
        nullable=False,
        default=dict,
    )


class InstrumentLifecycleEvent(Base):
    __tablename__ = "instrument_lifecycle_events"
    __table_args__ = (
        CheckConstraint(
            "event_type IN ('calibration', 'maintenance')",
            name="ck_instrument_lifecycle_events_type",
        ),
        Index("ix_instrument_events_instrument_time", "instrument_id", "occurred_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    instrument_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("instruments.id"),
        nullable=False,
        index=True,
    )
    event_type: Mapped[str] = mapped_column(String(32), nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    valid_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    affected_component: Mapped[str | None] = mapped_column(String(128), nullable=True)
    quantity: Mapped[str | None] = mapped_column(String(128), nullable=True)
    correction: Mapped[float | None] = mapped_column(Float, nullable=True)
    expanded_uncertainty: Mapped[float | None] = mapped_column(Float, nullable=True)
    details_json: Mapped[dict[str, Any]] = mapped_column(
        json_payload_type,
        nullable=False,
        default=dict,
    )
    certificate_file_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("file_assets.id"),
        nullable=True,
        index=True,
    )


def _reject_version_update(mapper: Mapper, connection: object, target: object) -> None:
    del mapper, connection, target
    raise ValueError("v2 entity version rows are immutable; insert a new version instead")


for version_model in (MaterialLotVersion, SetupVersion, InstrumentVersion):
    event.listen(version_model, "before_update", _reject_version_update)
    event.listen(version_model, "before_delete", _reject_version_update)
