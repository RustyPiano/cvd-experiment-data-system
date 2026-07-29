from pathlib import Path

import pytest

from app.models.file_asset import FileAsset
from app.services.file_storage_service import FileStorageService
from app.services.process_timeseries import ProcessTimeseriesError, project_process_timeseries


def test_csv_projection_generates_canonical_statistics(tmp_path: Path) -> None:
    storage = FileStorageService()
    storage.root = tmp_path
    (tmp_path / "curve.csv").write_text(
        "time_s,value\n0,0\n60,60\n120,0\n",
        encoding="utf-8",
    )
    asset = FileAsset(
        original_name="curve.csv",
        storage_path="curve.csv",
        sha256="a" * 64,
    )

    points, statistics = project_process_timeseries(
        asset,
        storage,
        "temperature",
        "°C",
        [{"start_s": 50, "end_s": 70}],
        120,
    )

    assert points[1] == {"time_s": 60.0, "value": 60.0}
    assert statistics["min"] == 0
    assert statistics["max"] == 50
    assert statistics["time_weighted_mean"] == pytest.approx(25)
    assert statistics["ramp_rate_per_min"] == 60
    assert statistics["cooling_rate_per_min"] == 60
    assert statistics["valid_duration_s"] == 100
    assert statistics["excluded_duration_s"] == 20
    assert statistics["sampling_interval_s"] == 60
    assert statistics["parser_version"] == "process_timeseries_csv_v1"


@pytest.mark.parametrize(
    ("content", "process_end", "reason"),
    [
        ("time_s,value\n0,1\nnan,2\n", 60, "finite"),
        ("time_s,value\n0,1\n60,inf\n", 60, "finite"),
        ("time_s,value\n0,1\n61,2\n", 60, "beyond"),
    ],
)
def test_csv_projection_rejects_nonfinite_and_out_of_process_values(
    tmp_path: Path,
    content: str,
    process_end: float,
    reason: str,
) -> None:
    storage = FileStorageService()
    storage.root = tmp_path
    (tmp_path / "invalid.csv").write_text(content, encoding="utf-8")
    asset = FileAsset(
        original_name="invalid.csv",
        storage_path="invalid.csv",
        sha256="b" * 64,
    )

    with pytest.raises(ProcessTimeseriesError, match=reason):
        project_process_timeseries(asset, storage, "pressure", "Pa", [], process_end)
