import json
import re
from datetime import date, datetime
from types import SimpleNamespace

import pytest

from app.services import v2_field_source


def test_load_field_source_bypasses_cache_in_development(tmp_path, monkeypatch) -> None:
    source = tmp_path / "fields.yaml"
    source.write_text("version: 1\n", encoding="utf-8")
    monkeypatch.setattr(
        v2_field_source,
        "get_settings",
        lambda: SimpleNamespace(app_env="development", app_debug=False),
        raising=False,
    )

    assert v2_field_source.load_field_source(str(source))["version"] == 1
    source.write_text("version: 2\n", encoding="utf-8")
    assert v2_field_source.load_field_source(str(source))["version"] == 2


@pytest.mark.parametrize("value", ["2026-07-24", date(2026, 7, 24)])
def test_offset_datetime_rejects_date_without_clock_time(value) -> None:
    with pytest.raises(ValueError, match="datetime"):
        v2_field_source.normalize_offset_datetime(value)


def test_naive_datetime_uses_configured_non_default_zoneinfo(monkeypatch) -> None:
    monkeypatch.setattr(
        v2_field_source,
        "get_settings",
        lambda: SimpleNamespace(experiment_timezone="America/New_York"),
    )

    normalized = v2_field_source.normalize_offset_datetime("2026-07-24T09:30:00")

    assert normalized.isoformat() == "2026-07-24T09:30:00-04:00"


def test_scientific_field_examples_and_meanings_are_machine_unambiguous() -> None:
    doc = v2_field_source.load_field_source()
    fields = {field["key"]: field for field in v2_field_source.experiment_fields(doc)}

    started_at = fields["started_at"]
    parsed_start = datetime.fromisoformat(started_at["example"])
    assert parsed_start.utcoffset() is not None

    gas_feeds = fields["gas_feeds"]
    assert gas_feeds["input"] == "逐气体供气数组"
    assert "每种气体独立" in gas_feeds["meaning"]
    assert "lot_ref.snapshot" in gas_feeds["note"]
    assert "end_min必须大于start_min" in gas_feeds["note"]

    temperature_program = fields["temperature_program"]
    assert temperature_program["input"] == "分温区温度程序"
    assert "严格递增" in temperature_program["note"]
    assert "拒绝任意字符串" in temperature_program["note"]

    pressure = fields["pressure_system"]
    assert "绝对压力" in pressure["label"]
    assert "绝对压力" in pressure["meaning"]
    assert "表压" in pressure["help"]

    assert fields["domain_size_um"]["validation"] == {"gt": 0}

    metrics = json.loads(fields["key_spectral_metrics"]["example"])
    assert isinstance(metrics, list) and metrics
    for metric in metrics:
        assert set(metric) == {"metric_code", "value", "unit"}
        assert re.fullmatch(r"[a-z][a-z0-9_]*", metric["metric_code"])
        assert isinstance(metric["value"], int | float) and not isinstance(metric["value"], bool)
        assert isinstance(metric["unit"], str) and metric["unit"].strip()


def test_material_lot_evidence_and_setup_structures_are_unambiguous() -> None:
    doc = v2_field_source.load_field_source()
    fields = {field["key"]: field for field in v2_field_source.entity_fields(doc)}

    purity = fields["purity"]
    assert purity["input"] == "数值"
    assert purity["unit"] == "%"
    assert "仅存质量百分数" in purity["meaning"]
    assert "派生显示" in purity["meaning"]
    assert "原始证书" in purity["note"]
    assert purity["example"] == "99.995（派生显示4N5）"

    label_attachment = fields["label_attachment"]
    assert label_attachment["input"] == "FileAsset引用"
    assert "原始照片" in label_attachment["meaning"]
    assert "与CoA分开" in label_attachment["note"]

    sensors = fields["temperature_sensors"]
    assert sensors["input"] == "温度传感器数组"
    assert "thermocouple|rtd|infrared_thermometer" in sensors["options"]
    assert "uncertainty_source" not in sensors["options"]

    tube = fields["tube_material_shape"]
    assert tube["input"] == "管材质形状对象"
    assert "独立保存" in tube["note"]
    assert v2_field_source.field_option_values("tube_material_shape", doc) == set()


def test_nested_structured_controlled_values_export_as_machine_codes() -> None:
    normalized = v2_field_source.canonicalize_controlled_values(
        {
            "gas_feeds": [
                {
                    "species": "H₂",
                    "measurement_source": "MFC",
                    "intervals": [{"start_min": 0, "end_min": 10, "flow_sccm": 20}],
                }
            ],
            "field_devices": ["等离子体"],
            "field_params": [{"field_type": "等离子体"}],
            "pretreatment_steps": [{"type": "等离子体"}],
            "tube_material_shape": {"material": "石英", "shape": "圆形"},
        }
    )

    assert normalized["gas_feeds"][0]["species"] == "H2"
    assert normalized["gas_feeds"][0]["measurement_source"] == "mfc"
    assert normalized["field_devices"] == ["plasma"]
    assert normalized["field_params"][0]["field_type"] == "plasma"
    assert normalized["pretreatment_steps"][0]["type"] == "plasma_treatment"
    assert normalized["tube_material_shape"] == {
        "material": "quartz",
        "shape": "round",
    }
