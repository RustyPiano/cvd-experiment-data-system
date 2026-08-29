from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.models.file_asset import FileAsset
from app.models.v2_entities import (
    CommercialProduct,
    MaterialLot,
    MaterialLotVersion,
    Substance,
)
from app.schemas.generated.v2_module_payload import MaterialLotVersionPayload
from app.schemas.scientific import PreparationOperationPayload
from app.services.scientific_revision_service import ScientificRevisionService
from app.services.v2_entity_service import V2EntityService
from app.services.v2_process_semantics import (
    frozen_gas_components,
    normalize_gas_components,
    valid_frozen_gas_reference,
)
from app.services.v2_reporting_service import V2ReportingService


def _mixed_gas_payload() -> dict:
    return {
        "lot_category": "gas_cylinder",
        "substance_name": "5% H2 in Ar",
        "chemical_formula": None,
        "batch_number": "MIX-001",
        "gas_components": [
            {"species": "H2", "volume_percent": 5},
            {"species": "Ar", "volume_percent": 95},
        ],
    }


def test_gas_components_are_normalized_without_requiring_purity() -> None:
    assert normalize_gas_components(
        [
            {"species": "CO₂", "volume_percent": 20},
            {"species": "other", "other_name": "Custom gas", "volume_percent": 80},
        ]
    ) == [
        {"species": "CO2", "volume_percent": 20.0},
        {"species": "other", "other_name": "Custom gas", "volume_percent": 80.0},
    ]
    with pytest.raises(ValueError, match="sum to 100"):
        normalize_gas_components([{"species": "Ar", "volume_percent": 99}])
    assert frozen_gas_components(
        {
            "lot_category": "gas_cylinder",
            "substance_name": "高纯氩",
            "chemical_formula": "Ar",
        }
    ) == [{"species": "Ar", "volume_percent": 100.0}]


def test_mixed_gas_lot_allows_null_formula_and_freezes_authoritative_snapshot(
    db_session,
    admin_user,
) -> None:
    entity = V2EntityService(db_session).create_entity(
        "material_lot",
        MaterialLotVersionPayload.model_validate(_mixed_gas_payload()),
        admin_user,
    )
    assert entity.latest_version is not None
    assert entity.latest_version.data["chemical_formula"] is None
    assert entity.latest_version.data["gas_components"][0] == {
        "species": "H2",
        "volume_percent": 5.0,
    }
    lot = db_session.get(MaterialLot, entity.id)
    assert lot is not None
    substance = db_session.get(Substance, lot.substance_id)
    assert substance is not None and substance.chemical_formula is None

    operation = PreparationOperationPayload.model_validate(
        {
            "operation_type": "gas_exchange",
            "duration_min": 10,
            "cycle_count": 3,
            "gas_sources": [
                {
                    "material_lot_id": str(entity.id),
                    "material_lot_version": 1,
                    "snapshot": {"tampered": True},
                }
            ],
        }
    ).model_dump(mode="json", exclude_none=True)
    process_steps = {"preparation_operations": [operation]}
    ScientificRevisionService(db_session).freeze_process_gas_references(process_steps)
    frozen_source = operation["gas_sources"][0]
    assert frozen_source["snapshot"]["attrs"]["gas_components"][1] == {
        "species": "Ar",
        "volume_percent": 95.0,
    }
    assert "tampered" not in frozen_source["snapshot"]
    assert valid_frozen_gas_reference(frozen_source)

    revision = SimpleNamespace(content_json={"modules": {"process_steps": process_steps}})
    exported_operation = V2ReportingService._export_modules(revision)["process_steps"][
        "preparation_operations"
    ][0]
    assert "gases" not in exported_operation
    assert exported_operation["gas_sources"][0]["snapshot"]["attrs"]["gas_components"] == [
        {"species": "H2", "volume_percent": 5.0},
        {"species": "Ar", "volume_percent": 95.0},
    ]


def test_legacy_pure_gas_can_append_a_composition_version_without_changing_identity(
    db_session,
    admin_user,
) -> None:
    substance = Substance(canonical_name="Argon", chemical_formula="Ar")
    db_session.add(substance)
    db_session.flush()
    product = CommercialProduct(
        substance_id=substance.id,
        supplier="Legacy Gas Co.",
        catalog_number="AR-5N",
    )
    db_session.add(product)
    db_session.flush()
    lot = MaterialLot(substance_id=substance.id, commercial_product_id=product.id)
    db_session.add(lot)
    db_session.flush()
    db_session.add(
        MaterialLotVersion(
            entity_id=lot.id,
            version=1,
            lot_category="gas_cylinder",
            substance_name="Argon",
            chemical_formula="Ar",
            batch_number="OLD-AR",
            attrs={"supplier": "Legacy Gas Co.", "catalog_number": "AR-5N"},
        )
    )
    db_session.commit()

    result = V2EntityService(db_session).append_version(
        "material_lot",
        lot.id,
        MaterialLotVersionPayload.model_validate(
            {
                "lot_category": "gas_cylinder",
                "substance_name": "Argon",
                "batch_number": "OLD-AR",
                "supplier": "Legacy Gas Co.",
                "catalog_number": "AR-5N",
                "gas_components": [{"species": "Ar", "volume_percent": 100}],
            }
        ),
        admin_user,
    )

    assert result.version == 2
    db_session.refresh(lot)
    assert lot.substance_id == substance.id
    assert lot.commercial_product_id == product.id


def test_entity_version_can_reuse_its_existing_attachment(db_session, admin_user) -> None:
    asset = FileAsset(
        uploaded_by_id=admin_user.id,
        original_name="coa.pdf",
        storage_path=f"entity/{uuid4()}_coa.pdf",
        size_bytes=3,
        sha256="c" * 64,
        method="entity_reference",
        file_category="raw",
        asset_role="entity_attachment",
        file_kind="entity_reference",
        metadata_json={},
    )
    db_session.add(asset)
    db_session.commit()
    payload = MaterialLotVersionPayload.model_validate(
        {
            "lot_category": "chemical",
            "substance_name": "MoO3",
            "chemical_formula": "MoO3",
            "batch_number": "ATTACHMENT-LOT",
            "coa_attachment": {
                "file_asset_id": str(asset.id),
                "sha256": asset.sha256,
            },
        }
    )
    service = V2EntityService(db_session)
    entity = service.create_entity("material_lot", payload, admin_user)

    result = service.append_version("material_lot", entity.id, payload, admin_user)

    assert result.version == 2
    db_session.refresh(asset)
    assert asset.entity_id == entity.id
    assert asset.entity_version == 1


def test_legacy_pure_gas_reference_remains_readable_but_cannot_be_locked_again() -> None:
    lot_id = "11111111-1111-4111-8111-111111111111"
    snapshot = {
        "entity_id": lot_id,
        "version": 1,
        "lot_category": "gas_cylinder",
        "substance_name": "Argon",
        "chemical_formula": "Ar",
        "batch_number": "AR-OLD",
        "attrs": {},
    }
    reference = {
        "entity_id": lot_id,
        "version": 1,
        "snapshot": snapshot,
    }
    assert frozen_gas_components(snapshot) == [{"species": "Ar", "volume_percent": 100.0}]
    assert valid_frozen_gas_reference({"species": "Ar", "lot_ref": reference})
    legacy_operation = PreparationOperationPayload.model_validate(
        {
            "operation_type": "gas_exchange",
            "duration_min": 10,
            "cycle_count": 2,
            "gases": ["Ar"],
        }
    )
    assert legacy_operation.gases == ["Ar"]
    with pytest.raises(HTTPException) as exc_info:
        ScientificRevisionService.__new__(ScientificRevisionService).freeze_process_gas_references(
            {
                "preparation_operations": [
                    legacy_operation.model_dump(mode="json", exclude_none=True)
                ]
            }
        )
    assert exc_info.value.detail["invalid"][0]["reason"] == "required"

    revision = SimpleNamespace(
        content_json={
            "modules": {
                "process_steps": {
                    "preparation_operations": [
                        {
                            "operation_type": "gas_exchange",
                            "duration_min": 10,
                            "cycle_count": 2,
                            "gases": ["Ar"],
                        }
                    ]
                }
            }
        }
    )
    assert V2ReportingService._export_modules(revision)["process_steps"]["preparation_operations"][
        0
    ]["gases"] == ["Ar"]


def test_reaction_flow_does_not_treat_a_premix_as_one_pure_species() -> None:
    lot_id = "22222222-2222-4222-8222-222222222222"
    snapshot = {
        "entity_id": lot_id,
        "version": 1,
        "lot_category": "gas_cylinder",
        "substance_name": "5% H2 in Ar",
        "chemical_formula": None,
        "batch_number": "MIX-001",
        "attrs": {"gas_components": _mixed_gas_payload()["gas_components"]},
    }
    assert not valid_frozen_gas_reference(
        {
            "species": "H2",
            "lot_ref": {
                "entity_id": lot_id,
                "version": 1,
                "snapshot": snapshot,
            },
        }
    )
