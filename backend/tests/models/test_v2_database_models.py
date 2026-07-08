from __future__ import annotations

from datetime import date
from pathlib import Path

import pytest
import yaml
from sqlalchemy import inspect
from sqlalchemy.exc import IntegrityError

from app.models.experiment import ExperimentRun
from app.models.module_payload import ExperimentModuleKey
from app.models.sample import Sample, SampleRole
from app.models.v2_entities import MaterialLot, MaterialLotVersion, Setup, SetupVersion
from app.models.v2_results import MeasuredProduct
from app.services.v2_entity_snapshot_service import apply_setup_reference

FIELD_SOURCE = Path(__file__).resolve().parents[3] / "docs" / "standard" / "field-source.yaml"


def _entity_fields(module_name: str) -> list[dict]:
    doc = yaml.safe_load(FIELD_SOURCE.read_text(encoding="utf-8"))
    return [
        field
        for section in doc["entities"]["sections"]
        for field in section["fields"]
        if field["module"] == module_name
    ]


def _required_entity_keys(module_name: str) -> set[str]:
    return {
        field["key"]
        for field in _entity_fields(module_name)
        if field["requirement"]["level"] == "required"
    }


@pytest.mark.parametrize(
    ("table_name", "module_name"),
    [
        ("material_lot_versions", "MaterialLot"),
        ("setup_versions", "装置Setup"),
        ("instrument_versions", "表征仪器"),
    ],
)
def test_entity_version_tables_use_field_source_required_keys_as_columns(
    db_session,
    table_name: str,
    module_name: str,
) -> None:
    columns = {column["name"] for column in inspect(db_session.bind).get_columns(table_name)}
    required_keys = _required_entity_keys(module_name) - {"version"}
    optional_keys = {
        field["key"]
        for field in _entity_fields(module_name)
        if field["key"] not in required_keys and field["key"] != "version"
    }

    assert {"entity_id", "version", "attrs"}.issubset(columns)
    assert required_keys.issubset(columns)
    assert optional_keys.isdisjoint(columns)


def test_entity_versions_are_unique_per_entity_and_keep_optional_fields_in_attrs(
    db_session,
) -> None:
    lot = MaterialLot()
    db_session.add(lot)
    db_session.flush()

    version = MaterialLotVersion(
        entity_id=lot.id,
        version=1,
        lot_category="化学品",
        substance_name="三氧化钼",
        chemical_formula="MoO3",
        batch_number="B202405",
        attrs={"supplier": "阿拉丁"},
    )
    db_session.add(version)
    db_session.commit()

    assert version.attrs == {"supplier": "阿拉丁"}

    db_session.add(
        MaterialLotVersion(
            entity_id=lot.id,
            version=1,
            lot_category="化学品",
            substance_name="三氧化钼",
            chemical_formula="MoO3",
            batch_number="B202406",
        )
    )
    with pytest.raises(IntegrityError):
        db_session.commit()


def test_v2_module_keys_are_supported_without_removing_v1_keys() -> None:
    assert {
        "basic_info",
        "target_product",
        "equipment",
        "precursors",
        "substrates",
        "process_steps",
        "process_events",
        "pvd",
    }.issubset({key.value for key in ExperimentModuleKey})
    assert ExperimentModuleKey.FURNACE_PROGRAM.value == "furnace_program"


def test_measured_products_reference_samples(db_session, active_user) -> None:
    run = ExperimentRun(
        run_code="RUN-V2-RESULT",
        owner_id=active_user.id,
        experiment_type="CVD",
        experiment_date=date(2026, 7, 8),
    )
    db_session.add(run)
    db_session.flush()
    sample = Sample(
        sample_code="S-V2-RESULT",
        experiment_run_id=run.id,
        role=SampleRole.PRODUCT,
    )
    db_session.add(sample)
    db_session.flush()

    product = MeasuredProduct(
        sample_id=sample.id,
        observed_phenomena=["不连续覆盖"],
        attrs={"operator_note": "光镜确认"},
    )
    db_session.add(product)
    db_session.commit()

    assert product.sample_id == sample.id
    assert product.sample.sample_code == "S-V2-RESULT"


def test_setup_reference_freezes_version_snapshot_on_experiment_run(
    db_session,
    active_user,
) -> None:
    run = ExperimentRun(
        run_code="RUN-V2-SETUP",
        owner_id=active_user.id,
        experiment_type="CVD",
        experiment_date=date(2026, 7, 8),
    )
    setup = Setup()
    db_session.add_all([run, setup])
    db_session.flush()
    version = SetupVersion(
        entity_id=setup.id,
        version=3,
        setup_code="CVD-炉1",
        setup_name="1号双温区管式炉",
        zone_count=2,
        orientation="水平",
        coordinate_system="原点=温区2热电偶；下游为正",
        attrs={"brand_model": "合肥科晶 OTF-1200X"},
    )

    apply_setup_reference(run, version)

    assert run.setup_ref == setup.id
    assert run.setup_ref_version == 3
    assert run.setup_ref_snapshot_json == {
        "setup_ref": str(setup.id),
        "setup_ref_version": 3,
        "setup_code_snapshot": "CVD-炉1",
        "setup_name_snapshot": "1号双温区管式炉",
        "zone_count_snapshot": 2,
        "orientation_snapshot": "水平",
        "coordinate_system_snapshot": "原点=温区2热电偶；下游为正",
        "attrs_snapshot": {"brand_model": "合肥科晶 OTF-1200X"},
    }
