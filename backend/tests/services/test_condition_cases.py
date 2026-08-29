import json
from pathlib import Path

import pytest

from app.services.v2_field_source import condition_local_key, condition_matches, load_field_source

CASES = json.loads(
    (Path(__file__).resolve().parents[3] / "docs/standard/condition-cases.json").read_text()
)["cases"]


@pytest.mark.parametrize("case", CASES, ids=lambda case: case["name"])
def test_condition_cases(case: dict) -> None:
    condition = case["condition"]
    if case.get("unresolvable"):
        doc = load_field_source()
        field = next(
            field
            for section in doc["experiment_record"]["sections"]
            for field in section["fields"]
            if field.get("requirement", {}).get("condition")
        )
        local_key = condition_local_key(field, condition, doc)
        assert local_key is None
        assert (local_key is not None and condition_matches(condition, case["driver"])) is case[
            "expected"
        ]
    elif backend := case.get("backend"):
        assert backend == {
            "raises": "ValueError",
            "message": "Unsupported condition op",
        }
        with pytest.raises(ValueError, match=backend["message"]):
            condition_matches(condition, case["driver"])
    else:
        assert condition_matches(condition, case["driver"]) is case["expected"]
