from __future__ import annotations

import uuid
from datetime import datetime
from enum import StrEnum

from sqlalchemy import JSON, Boolean, DateTime, Integer, String, Uuid, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

json_payload_type = JSON().with_variant(JSONB(), "postgresql")


class FieldType(StrEnum):
    TEXT = "text"
    NUMBER = "number"
    BOOLEAN = "boolean"
    SELECT = "select"
    TEXTAREA = "textarea"
    DATE = "date"
    MULTI_SELECT = "multi_select"
    ARRAY = "array"


class FieldDefinition(Base):
    __tablename__ = "experiment_field_definitions"
    __table_args__ = ({"comment": "字段词典：定义每个模块中字段的元数据"},)

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    field_key: Mapped[str] = mapped_column(
        String(128), nullable=False, comment="字段标识，如 species, indoor_temperature_C"
    )
    module_key: Mapped[str] = mapped_column(
        String(64), nullable=False, comment="所属模块，如 precursors, environment"
    )
    label_zh: Mapped[str] = mapped_column(
        String(128), nullable=False, comment="中文名，如 物种, 室内温度"
    )
    label_en: Mapped[str | None] = mapped_column(
        String(128), nullable=True, comment="英文名，如 Species, Indoor Temperature"
    )
    field_type: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        default=FieldType.TEXT.value,
        comment="字段类型：text, number, boolean, select, textarea, date, multi_select, array",
    )
    unit: Mapped[str | None] = mapped_column(
        String(32), nullable=True, comment="单位，如 ℃, sccm, mg, rpm"
    )
    required: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, comment="是否必填"
    )
    default_strategy: Mapped[str | None] = mapped_column(
        String(64), nullable=True, comment="默认值策略：empty, inherit, last_used, recipe"
    )
    inheritable: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, comment="是否可从 Recipe 或上次实验继承"
    )
    vocab_key: Mapped[str | None] = mapped_column(
        String(64), nullable=True, comment="关联的受控词表 key，如 material_system, substrate_type"
    )
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0, comment="排序顺序")
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, index=True, comment="是否启用"
    )
    metadata_json: Mapped[dict] = mapped_column(
        json_payload_type,
        nullable=False,
        default=dict,
        comment="扩展元数据，如 validation range, conditional rules",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
