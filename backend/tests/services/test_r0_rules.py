from uuid import uuid4

from app.models.experiment import ExperimentRun
from app.services import v2_r0_service


def test_solution_coating_does_not_require_an_ingredient_amount() -> None:
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
    for method, applicable in (("dip_coat", False), ("drop_cast", False), ("grind", True)):
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
