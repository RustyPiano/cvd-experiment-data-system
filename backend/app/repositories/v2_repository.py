from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.v2_results import CharacterizationRecord, MeasuredProduct


class V2EntityRepository:
    def __init__(self, db: Session, entity_model: type, version_model: type) -> None:
        self.db = db
        self.entity_model = entity_model
        self.version_model = version_model

    def create_entity(self, **values: Any) -> Any:
        entity = self.entity_model(**values)
        self.db.add(entity)
        self.db.flush()
        self.db.refresh(entity)
        return entity

    def save_version(self, version: Any) -> Any:
        self.db.add(version)
        self.db.flush()
        self.db.refresh(version)
        return version

    def get_entity(self, entity_id: UUID) -> Any | None:
        return self.db.get(self.entity_model, entity_id)

    def list_entities(self) -> list[Any]:
        statement = select(self.entity_model).order_by(self.entity_model.created_at)
        return list(self.db.scalars(statement))

    def list_versions(self, entity_id: UUID) -> list[Any]:
        return list(
            self.db.scalars(
                select(self.version_model)
                .where(self.version_model.entity_id == entity_id)
                .order_by(self.version_model.version.asc())
            )
        )

    def get_version(self, entity_id: UUID, version: int) -> Any | None:
        return self.db.scalar(
            select(self.version_model).where(
                self.version_model.entity_id == entity_id,
                self.version_model.version == version,
            )
        )

    def latest_version(self, entity_id: UUID) -> Any | None:
        return self.db.scalar(
            select(self.version_model)
            .where(self.version_model.entity_id == entity_id)
            .order_by(self.version_model.version.desc())
            .limit(1)
        )

    def next_version(self, entity_id: UUID) -> int:
        return (
            self.db.scalar(
                select(func.max(self.version_model.version)).where(
                    self.version_model.entity_id == entity_id
                )
            )
            or 0
        ) + 1


class V2ResultRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def list_characterization_records(
        self, experiment_run_id: UUID
    ) -> list[CharacterizationRecord]:
        return list(
            self.db.scalars(
                select(CharacterizationRecord)
                .where(CharacterizationRecord.experiment_run_id == experiment_run_id)
                .order_by(CharacterizationRecord.created_at.asc(), CharacterizationRecord.id.asc())
            )
        )

    def get_characterization_record(self, record_id: UUID) -> CharacterizationRecord | None:
        return self.db.get(CharacterizationRecord, record_id)

    def save_characterization_record(
        self, record: CharacterizationRecord
    ) -> CharacterizationRecord:
        self.db.add(record)
        self.db.flush()
        self.db.refresh(record)
        return record

    def list_measured_products(self, sample_id: UUID) -> list[MeasuredProduct]:
        return list(
            self.db.scalars(
                select(MeasuredProduct)
                .where(MeasuredProduct.sample_id == sample_id)
                .order_by(MeasuredProduct.created_at.asc(), MeasuredProduct.id.asc())
            )
        )

    def get_measured_product(self, product_id: UUID) -> MeasuredProduct | None:
        return self.db.get(MeasuredProduct, product_id)

    def save_measured_product(self, product: MeasuredProduct) -> MeasuredProduct:
        self.db.add(product)
        self.db.flush()
        self.db.refresh(product)
        return product

    def delete(self, row: object) -> None:
        self.db.delete(row)
        self.db.flush()
