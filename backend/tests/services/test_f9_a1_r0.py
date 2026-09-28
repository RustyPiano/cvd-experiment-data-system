from uuid import uuid4

from app.models.experiment import ExperimentRun
from app.models.module_payload import ExperimentModulePayload
from app.services import v2_r0_service


def test_immersion_does_not_require_an_assumed_precursor_amount() -> None:
    run = ExperimentRun(id=uuid4(), run_code="CVD-2026-0930", status="draft")
    load = {
        "load_key": "coating",
        "loading_method": "substrate_surface",
        "preparation_steps": [
            {
                "step_type": "dip_coat",
                "sequence": 1,
                "parameters": {"solvent": "water", "duration_min": 5},
            }
        ],
        "substrate_source_ids": [str(uuid4())],
        "ingredients": [
            {
                "material_lot_id": str(uuid4()),
                "material_lot_version": 1,
                "concentration_value": 0.1,
                "concentration_unit": "mol_per_L",
            }
        ],
    }
    for method, applicable in (("dip_coat", False), ("drop_cast", True)):
        load["preparation_steps"][0]["step_type"] = method
        report = v2_r0_service.build_run_report(run, {"precursors": {"items": [load]}})
        amount = next(
            item
            for item in report["items"]
            if item["module_key"] == "precursors" and item["key"] == "amount"
        )
        assert amount["applicable"] is applicable
        if applicable:
            assert not amount["passed"]


def test_setup_ref_r0_uses_run_reference_not_payload(monkeypatch) -> None:
    field = {
        "key": "setup_ref",
        "label": "装置引用",
        "module": "§2",
        "r0": True,
        "requirement": {"level": "required"},
    }
    run = ExperimentRun(run_code="CVD-2026-0001", setup_ref=None)
    run.module_payloads = [
        ExperimentModulePayload(module_key="equipment", payload_json={"setup_ref": "garbage"})
    ]
    doc = {"modules": {"§2": "equipment"}, "entity_keys": {}}
    monkeypatch.setattr(v2_r0_service, "load_field_source", lambda: doc)
    monkeypatch.setattr(v2_r0_service, "experiment_fields", lambda _doc: [field])

    without_reference = v2_r0_service.build_run_report(run)
    run.setup_ref = uuid4()
    with_reference = v2_r0_service.build_run_report(run)

    assert without_reference["status"] == "non_compliant"
    assert with_reference["status"] == "compliant"
