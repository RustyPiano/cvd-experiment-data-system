from __future__ import annotations

from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.file_asset import FileAsset
from app.models.user import User
from app.models.v2_entities import (
    ContainerInstance,
    EquipmentComponentInstance,
    EquipmentLifecycleEvent,
    Instrument,
    InstrumentLifecycleEvent,
    MaterialLot,
    SetupVersion,
    SetupVersionComponent,
)
from app.schemas.scientific import (
    ContainerInstanceCreate,
    ContainerInstanceRead,
    EquipmentComponentCreate,
    EquipmentComponentRead,
    LifecycleEventCreate,
    LifecycleEventRead,
    SetupComponentBindingCreate,
)
from app.services.audit_service import AuditService


class ReferenceDataService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.audit = AuditService(db)

    def create_container(
        self,
        payload: ContainerInstanceCreate,
        actor: User,
    ) -> ContainerInstanceRead:
        if self.db.get(MaterialLot, payload.material_lot_id) is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Unknown lot"
            )
        container = ContainerInstance(
            **payload.model_dump(exclude_none=True),
            status="available",
        )
        self.db.add(container)
        self._commit_unique(actor, "container_instance", container, payload.container_code)
        return ContainerInstanceRead.model_validate(container)

    def list_containers(self, material_lot_id: UUID | None) -> list[ContainerInstanceRead]:
        statement = select(ContainerInstance).order_by(ContainerInstance.container_code)
        if material_lot_id is not None:
            statement = statement.where(ContainerInstance.material_lot_id == material_lot_id)
        return [ContainerInstanceRead.model_validate(item) for item in self.db.scalars(statement)]

    def create_component(
        self,
        payload: EquipmentComponentCreate,
        actor: User,
    ) -> EquipmentComponentRead:
        component = EquipmentComponentInstance(
            **payload.model_dump(exclude_none=True),
        )
        self.db.add(component)
        self._commit_unique(actor, "equipment_component", component, payload.component_code)
        return EquipmentComponentRead.model_validate(component)

    def list_components(self) -> list[EquipmentComponentRead]:
        return [
            EquipmentComponentRead.model_validate(item)
            for item in self.db.scalars(
                select(EquipmentComponentInstance).order_by(
                    EquipmentComponentInstance.component_code
                )
            )
        ]

    def bind_setup_component(
        self,
        setup_version_id: UUID,
        payload: SetupComponentBindingCreate,
        actor: User,
    ) -> None:
        if self.db.get(SetupVersion, setup_version_id) is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Setup version not found",
            )
        if self.db.get(EquipmentComponentInstance, payload.component_id) is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Equipment component not found",
            )
        binding = SetupVersionComponent(
            setup_version_id=setup_version_id,
            component_id=payload.component_id,
            role=payload.role,
            position_json=payload.position,
        )
        self.db.add(binding)
        try:
            self.db.flush()
        except IntegrityError as exc:
            self.db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Component is already bound in that role",
            ) from exc
        self.audit.record_event(
            actor=actor,
            entity_type="setup_version",
            entity_id=setup_version_id,
            action="bind_component",
            before_json=None,
            after_json=payload.model_dump(mode="json"),
        )
        self.db.commit()

    def create_equipment_event(
        self,
        component_id: UUID,
        payload: LifecycleEventCreate,
        actor: User,
    ) -> LifecycleEventRead:
        if self.db.get(EquipmentComponentInstance, component_id) is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Component not found")
        self._validate_certificate(payload.certificate_file_id)
        event = EquipmentLifecycleEvent(
            component_id=component_id,
            event_type=payload.event_type,
            occurred_at=payload.occurred_at,
            valid_until=payload.valid_until,
            quantity=payload.quantity,
            correction=payload.correction,
            expanded_uncertainty=payload.expanded_uncertainty,
            details_json=payload.details
            | (
                {"affected_component": payload.affected_component}
                if payload.affected_component
                else {}
            ),
            certificate_file_id=payload.certificate_file_id,
        )
        self.db.add(event)
        self.db.flush()
        self._audit_lifecycle(actor, "equipment_component", component_id, event)
        self.db.commit()
        return self._event_read(event)

    def create_instrument_event(
        self,
        instrument_id: UUID,
        payload: LifecycleEventCreate,
        actor: User,
    ) -> LifecycleEventRead:
        if payload.event_type not in {"calibration", "maintenance"}:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Instrument events must be calibration or maintenance",
            )
        if self.db.get(Instrument, instrument_id) is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Instrument not found"
            )
        self._validate_certificate(payload.certificate_file_id)
        event = InstrumentLifecycleEvent(
            instrument_id=instrument_id,
            event_type=payload.event_type,
            occurred_at=payload.occurred_at,
            valid_until=payload.valid_until,
            affected_component=payload.affected_component,
            quantity=payload.quantity,
            correction=payload.correction,
            expanded_uncertainty=payload.expanded_uncertainty,
            details_json=payload.details,
            certificate_file_id=payload.certificate_file_id,
        )
        self.db.add(event)
        self.db.flush()
        self._audit_lifecycle(actor, "instrument", instrument_id, event)
        self.db.commit()
        return self._event_read(event)

    def _commit_unique(
        self,
        actor: User,
        entity_type: str,
        entity: ContainerInstance | EquipmentComponentInstance,
        code: str,
    ) -> None:
        try:
            self.db.flush()
        except IntegrityError as exc:
            self.db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Duplicate code: {code}",
            ) from exc
        self.audit.record_event(
            actor=actor,
            entity_type=entity_type,
            entity_id=entity.id,
            action="create",
            before_json=None,
            after_json={"code": code},
        )
        self.db.commit()
        self.db.refresh(entity)

    def _validate_certificate(self, file_id: UUID | None) -> None:
        if file_id is None:
            return
        file = self.db.get(FileAsset, file_id)
        if file is None or file.deleted_at is not None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Certificate file is unavailable",
            )

    def _audit_lifecycle(
        self,
        actor: User,
        entity_type: str,
        entity_id: UUID,
        event: EquipmentLifecycleEvent | InstrumentLifecycleEvent,
    ) -> None:
        self.audit.record_event(
            actor=actor,
            entity_type=entity_type,
            entity_id=entity_id,
            action=event.event_type,
            before_json=None,
            after_json={
                "event_id": str(event.id),
                "occurred_at": event.occurred_at.isoformat(),
                "valid_until": (event.valid_until.isoformat() if event.valid_until else None),
                "quantity": event.quantity,
                "correction": event.correction,
                "expanded_uncertainty": event.expanded_uncertainty,
            },
        )

    @staticmethod
    def _event_read(
        event: EquipmentLifecycleEvent | InstrumentLifecycleEvent,
    ) -> LifecycleEventRead:
        return LifecycleEventRead(
            id=event.id,
            event_type=event.event_type,
            occurred_at=event.occurred_at,
            valid_until=event.valid_until,
            quantity=event.quantity,
            correction=event.correction,
            expanded_uncertainty=event.expanded_uncertainty,
            details=event.details_json,
            certificate_file_id=event.certificate_file_id,
        )
