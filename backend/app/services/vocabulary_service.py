from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.user import User, UserRole
from app.models.vocabulary import ControlledVocabulary
from app.repositories.vocabulary_repository import VocabularyRepository
from app.schemas.vocabulary import (
    ControlledVocabularyCreate,
    ControlledVocabularyListResponse,
    ControlledVocabularyRead,
    ControlledVocabularyUpdate,
    UserVocabularyCreate,
    VocabularyGroupUpsertRequest,
    VocabularyReorderRequest,
)
from app.services.audit_service import AuditService

# Vocabularies a normal (non-admin) user may extend by typing a new value.
# Keep this narrow so user input cannot pollute controlled enums.
USER_EXTENDABLE_VOCAB_KEYS = frozenset({"substrate_brand", "precursor_brand"})


class VocabularyService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.audit = AuditService(db)
        self.vocabularies = VocabularyRepository(db)

    def list_active_vocabularies(
        self,
        *,
        vocab_key: str | None = None,
    ) -> ControlledVocabularyListResponse:
        items = self.vocabularies.list_entries(vocab_key=vocab_key, active_only=True)
        return ControlledVocabularyListResponse(
            items=[ControlledVocabularyRead.model_validate(item) for item in items],
            total=len(items),
        )

    def list_admin_vocabularies(
        self,
        *,
        current_user: User,
        vocab_key: str | None = None,
    ) -> ControlledVocabularyListResponse:
        self._require_admin(current_user)
        items = self.vocabularies.list_entries(vocab_key=vocab_key, active_only=False)
        return ControlledVocabularyListResponse(
            items=[ControlledVocabularyRead.model_validate(item) for item in items],
            total=len(items),
        )

    def create_vocabulary(
        self,
        payload: ControlledVocabularyCreate,
        current_user: User,
    ) -> ControlledVocabularyRead:
        self._require_admin(current_user)
        entry = ControlledVocabulary(**payload.model_dump())
        try:
            saved = self.vocabularies.create(entry)
            self.audit.record_event(
                actor=current_user,
                entity_type="controlled_vocabulary",
                entity_id=saved.id,
                action="create",
                before_json=None,
                after_json=self._serialize_vocabulary(saved),
            )
            self.db.commit()
        except IntegrityError as exc:
            self.db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Vocabulary entry already exists",
            ) from exc
        return ControlledVocabularyRead.model_validate(saved)

    def create_user_value(
        self,
        payload: UserVocabularyCreate,
        current_user: User,
    ) -> ControlledVocabularyRead:
        """Idempotently add a user-typed value to a shared, user-extendable vocabulary.

        The new value is immediately active and visible to everyone. Re-submitting an
        existing value is a no-op (returns it, reactivating it if it was disabled).
        """
        vocab_key = payload.vocab_key
        value = payload.value.strip()
        if not value:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Vocabulary value cannot be empty",
            )
        if vocab_key not in USER_EXTENDABLE_VOCAB_KEYS:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Vocabulary '{vocab_key}' cannot be extended by users",
            )

        existing = self.vocabularies.get_by_key_value(vocab_key, value)
        if existing is not None:
            if not existing.is_active:
                before = self._serialize_vocabulary(existing)
                existing.is_active = True
                saved = self.vocabularies.save(existing)
                self.audit.record_event(
                    actor=current_user,
                    entity_type="controlled_vocabulary",
                    entity_id=saved.id,
                    action="update",
                    before_json=before,
                    after_json=self._serialize_vocabulary(saved),
                )
                self.db.commit()
            return ControlledVocabularyRead.model_validate(existing)

        entry = ControlledVocabulary(
            vocab_key=vocab_key,
            value=value,
            label_zh=value,
            label_en=value,
            sort_order=self.vocabularies.max_sort_order(vocab_key) + 1,
            is_active=True,
            metadata_json={"source": "user", "created_by": str(current_user.id)},
        )
        try:
            saved = self.vocabularies.create(entry)
            self.audit.record_event(
                actor=current_user,
                entity_type="controlled_vocabulary",
                entity_id=saved.id,
                action="create",
                before_json=None,
                after_json=self._serialize_vocabulary(saved),
            )
            self.db.commit()
        except IntegrityError:
            # Lost a race against a concurrent insert of the same value; return the winner.
            self.db.rollback()
            winner = self.vocabularies.get_by_key_value(vocab_key, value)
            if winner is None:
                raise
            return ControlledVocabularyRead.model_validate(winner)
        return ControlledVocabularyRead.model_validate(saved)

    def update_vocabulary(
        self,
        vocab_id: UUID,
        payload: ControlledVocabularyUpdate,
        current_user: User,
    ) -> ControlledVocabularyRead:
        self._require_admin(current_user)
        entry = self.vocabularies.get_by_id(vocab_id)
        if entry is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Vocabulary entry not found",
            )

        updates = payload.model_dump(exclude_unset=True)
        group_key_provided = "group_key" in updates
        group_key_value = updates.pop("group_key", None)
        before = self._serialize_vocabulary(entry)
        for field, value in updates.items():
            setattr(entry, field, value)
        if group_key_provided:
            self._apply_group_membership(entry, group_key_value)

        try:
            saved = self.vocabularies.save(entry)
            self.audit.record_event(
                actor=current_user,
                entity_type="controlled_vocabulary",
                entity_id=saved.id,
                action="update",
                before_json=before,
                after_json=self._serialize_vocabulary(saved),
            )
            self.db.commit()
        except IntegrityError as exc:
            self.db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Vocabulary entry already exists",
            ) from exc
        return ControlledVocabularyRead.model_validate(saved)

    def reorder_vocabularies(
        self,
        payload: VocabularyReorderRequest,
        current_user: User,
    ) -> ControlledVocabularyListResponse:
        """按 ordered_ids 顺序把同一 vocab_key 的条目 sort_order 重排为列表下标。

        要求 ordered_ids 恰好「不重不漏」地覆盖该 vocab_key 的全部条目，否则部分
        重排会让漏掉的条目与新下标撞号、破坏全序——对外契约须显式拒绝。
        """
        self._require_admin(current_user)
        entries = self._load_owned_entries(payload.ordered_ids, payload.vocab_key)

        if len(set(payload.ordered_ids)) != len(payload.ordered_ids):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="ordered_ids contains duplicate entries",
            )
        all_ids = {
            entry.id for entry in self.vocabularies.list_entries(vocab_key=payload.vocab_key)
        }
        if set(payload.ordered_ids) != all_ids:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=(
                    f"ordered_ids must cover exactly all entries of vocab_key '{payload.vocab_key}'"
                ),
            )

        for index, vocab_id in enumerate(payload.ordered_ids):
            entry = entries[vocab_id]
            before = self._serialize_vocabulary(entry)
            entry.sort_order = index
            self.vocabularies.save(entry)
            self.audit.record_event(
                actor=current_user,
                entity_type="controlled_vocabulary",
                entity_id=entry.id,
                action="reorder",
                before_json=before,
                after_json=self._serialize_vocabulary(entry),
            )
        self.db.commit()
        return self.list_admin_vocabularies(current_user=current_user, vocab_key=payload.vocab_key)

    def upsert_group(
        self,
        payload: VocabularyGroupUpsertRequest,
        current_user: User,
    ) -> ControlledVocabularyListResponse:
        """定义/编辑一个分组：把统一的标签/排序应用到 (vocab_key, group_key) 的
        全部成员（既有 + member_ids 新增），保证组内一致。"""
        self._require_admin(current_user)
        requested = self._load_owned_entries(payload.member_ids, payload.vocab_key)

        # 受影响成员 = 该分组既有成员 ∪ 本次指定成员（去重）。
        affected: dict[UUID, ControlledVocabulary] = {
            entry.id: entry
            for entry in self.vocabularies.list_by_group(payload.vocab_key, payload.group_key)
        }
        affected.update(requested)

        for entry in affected.values():
            before = self._serialize_vocabulary(entry)
            entry.group_key = payload.group_key
            entry.group_label_zh = payload.group_label_zh
            entry.group_label_en = payload.group_label_en
            entry.group_sort_order = payload.group_sort_order
            self.vocabularies.save(entry)
            self.audit.record_event(
                actor=current_user,
                entity_type="controlled_vocabulary",
                entity_id=entry.id,
                action="group_upsert",
                before_json=before,
                after_json=self._serialize_vocabulary(entry),
            )
        self.db.commit()
        return self.list_admin_vocabularies(current_user=current_user, vocab_key=payload.vocab_key)

    def _load_owned_entries(
        self,
        ids: list[UUID],
        vocab_key: str,
    ) -> dict[UUID, ControlledVocabulary]:
        """按 id 取条目，校验全部存在且同属 vocab_key，否则 422。"""
        entries = {entry.id: entry for entry in self.vocabularies.get_many(ids)}
        missing = [vid for vid in ids if vid not in entries]
        if missing:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=f"Unknown vocabulary entries: {[str(v) for v in missing]}",
            )
        foreign = [vid for vid, entry in entries.items() if entry.vocab_key != vocab_key]
        if foreign:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=f"Entries do not belong to vocab_key '{vocab_key}'",
            )
        return entries

    def _apply_group_membership(
        self,
        entry: ControlledVocabulary,
        group_key: str | None,
    ) -> None:
        """PATCH 分组成员：null/空清除分组；否则继承该已存在分组的标签（一致性）。"""
        normalized = (group_key or "").strip()
        if not normalized:
            entry.group_key = None
            entry.group_label_zh = None
            entry.group_label_en = None
            entry.group_sort_order = None
            return

        siblings = [
            sibling
            for sibling in self.vocabularies.list_by_group(entry.vocab_key, normalized)
            if sibling.id != entry.id
        ]
        if not siblings:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=(
                    f"Group '{normalized}' is not defined for vocab_key "
                    f"'{entry.vocab_key}'; define it via the groups endpoint first"
                ),
            )
        canonical = siblings[0]
        entry.group_key = normalized
        entry.group_label_zh = canonical.group_label_zh
        entry.group_label_en = canonical.group_label_en
        entry.group_sort_order = canonical.group_sort_order

    def _require_admin(self, current_user: User) -> None:
        if current_user.role != UserRole.ADMIN:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )

    def _serialize_vocabulary(self, entry: ControlledVocabulary) -> dict:
        return {
            "id": str(entry.id),
            "vocab_key": entry.vocab_key,
            "value": entry.value,
            "group_key": entry.group_key,
            "group_label_zh": entry.group_label_zh,
            "group_label_en": entry.group_label_en,
            "group_sort_order": entry.group_sort_order,
            "label_zh": entry.label_zh,
            "label_en": entry.label_en,
            "sort_order": entry.sort_order,
            "is_active": entry.is_active,
            "metadata_json": entry.metadata_json,
        }
