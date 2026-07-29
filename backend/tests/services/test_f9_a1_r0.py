from uuid import uuid4

from app.models.experiment import ExperimentRun
from app.models.module_payload import ExperimentModulePayload
from app.services import v2_r0_service


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
