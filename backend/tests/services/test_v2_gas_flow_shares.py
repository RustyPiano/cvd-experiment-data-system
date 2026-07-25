import math

import pytest

from app.services.v2_reporting_service import derive_gas_flow_shares


def test_gas_flow_shares_slice_all_boundaries_and_sum_overlaps() -> None:
    rows = derive_gas_flow_shares(
        [
            {
                "species": "Ar",
                "lot_ref": {"entity_id": "argon", "version": 2},
                "intervals": [
                    {"start_min": 0.0, "end_min": 10.0, "flow_sccm": 20.0},
                    {"start_min": 5.0, "end_min": 15.0, "flow_sccm": 30.0},
                ],
            },
            {
                "species": "H2",
                "lot_ref": {"entity_id": "hydrogen", "version": 1},
                "intervals": [{"start_min": 5.0, "end_min": 10.0, "flow_sccm": 50.0}],
            },
        ]
    )

    assert [(row["interval_start_min"], row["interval_end_min"], row["gas"]) for row in rows] == [
        (0.0, 5.0, "Ar"),
        (5.0, 10.0, "Ar"),
        (5.0, 10.0, "H2"),
        (10.0, 15.0, "Ar"),
    ]
    middle = [row for row in rows if row["interval_index"] == 2]
    assert [(row["gas"], row["flow_sccm"]) for row in middle] == [
        ("Ar", 50.0),
        ("H2", 50.0),
    ]
    assert [row["flow_percent"] for row in middle] == pytest.approx([50.0, 50.0])


def test_gas_flow_shares_ignore_empty_invalid_and_zero_total_segments() -> None:
    assert derive_gas_flow_shares(None) == []
    assert (
        derive_gas_flow_shares(
            [
                {
                    "species": "Ar",
                    "intervals": [
                        {"start_min": 0.0, "end_min": 5.0, "flow_sccm": 0.0},
                        {"start_min": 5.0, "end_min": 5.0, "flow_sccm": 10.0},
                        {
                            "start_min": 5.0,
                            "end_min": 10.0,
                            "flow_sccm": math.nan,
                        },
                    ],
                }
            ]
        )
        == []
    )
