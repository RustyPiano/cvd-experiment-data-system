from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

# sentinel: group_key 在 Update 中需区分「未提供」与「显式置空（清除分组）」，
# 由 model_dump(exclude_unset=True) 承担，这里仅声明字段。


class ControlledVocabularyCreate(BaseModel):
    vocab_key: str = Field(min_length=1, max_length=64)
    value: str = Field(min_length=1, max_length=128)
    label_zh: str = Field(min_length=1, max_length=128)
    label_en: str | None = Field(default=None, max_length=128)
    sort_order: int = 0
    is_active: bool = True
    metadata_json: dict[str, Any] = Field(default_factory=dict)


class UserVocabularyCreate(BaseModel):
    """Payload for a normal user contributing a new value to a shared vocabulary."""

    vocab_key: str = Field(min_length=1, max_length=64)
    value: str = Field(min_length=1, max_length=128)


class ControlledVocabularyUpdate(BaseModel):
    value: str | None = Field(default=None, max_length=128)
    label_zh: str | None = Field(default=None, max_length=128)
    label_en: str | None = Field(default=None, max_length=128)
    sort_order: int | None = None
    is_active: bool | None = None
    metadata_json: dict[str, Any] | None = None
    # 分组成员变更：置 null 清除分组；置已存在分组键则继承该组标签（一致性由
    # service 保证，分组标签本身经 groups 端点统一维护，而非逐行编辑）。
    group_key: str | None = Field(default=None, max_length=64)


class VocabularyReorderRequest(BaseModel):
    """按给定顺序重排同一 vocab_key 下条目的 sort_order（= 列表下标）。"""

    vocab_key: str = Field(min_length=1, max_length=64)
    ordered_ids: list[UUID] = Field(min_length=1)


class VocabularyGroupUpsertRequest(BaseModel):
    """定义/编辑一个分组：把 member_ids 归入 (vocab_key, group_key)，并把统一的
    标签/排序应用到该分组的全部成员（既有 + 新增），保证组内一致（T1.5 口径）。"""

    vocab_key: str = Field(min_length=1, max_length=64)
    group_key: str = Field(min_length=1, max_length=64)
    group_label_zh: str = Field(min_length=1, max_length=128)
    group_label_en: str | None = Field(default=None, max_length=128)
    group_sort_order: int = 0
    member_ids: list[UUID] = Field(default_factory=list)


class ControlledVocabularyRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    vocab_key: str
    value: str
    group_key: str | None
    group_label_zh: str | None
    group_label_en: str | None
    group_sort_order: int | None
    label_zh: str
    label_en: str | None
    sort_order: int
    is_active: bool
    metadata_json: dict[str, Any]
    created_at: datetime
    updated_at: datetime


class ControlledVocabularyListResponse(BaseModel):
    items: list[ControlledVocabularyRead]
    total: int
