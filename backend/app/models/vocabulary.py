from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import JSON, Boolean, DateTime, Integer, String, UniqueConstraint, Uuid, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

json_payload_type = JSON().with_variant(JSONB(), "postgresql")


class ControlledVocabulary(Base):
    __tablename__ = "controlled_vocabularies"
    __table_args__ = (
        UniqueConstraint("vocab_key", "value", name="uq_controlled_vocabularies_key_value"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    vocab_key: Mapped[str] = mapped_column(String(64), index=True)
    value: Mapped[str] = mapped_column(String(128))
    # 同一 vocab_key 内的分组键（如 substrate_type 的 silicon/sapphire）；
    # 为空表示未分组，列表中排在已分组之后。
    group_key: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # 分组的显示标签与排序（后端单一数据源；同一 (vocab_key, group_key) 内一致，由守卫测试保证）。
    group_label_zh: Mapped[str | None] = mapped_column(String(128), nullable=True)
    group_label_en: Mapped[str | None] = mapped_column(String(128), nullable=True)
    group_sort_order: Mapped[int | None] = mapped_column(Integer, nullable=True)
    label_zh: Mapped[str] = mapped_column(String(128))
    label_en: Mapped[str | None] = mapped_column(String(128), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    metadata_json: Mapped[dict[str, Any]] = mapped_column(
        json_payload_type, nullable=False, default=dict
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )
