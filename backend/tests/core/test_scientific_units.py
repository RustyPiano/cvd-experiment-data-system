import pytest

from app.core.scientific_units import normalize_process_value


def test_scientific_unit_normalization() -> None:
    assert normalize_process_value("temperature", "K", 273.15) == pytest.approx(0)
    assert normalize_process_value("pressure", "Torr", 760) == pytest.approx(101_325)
    assert normalize_process_value("pressure", "mbar", 1_013.25) == pytest.approx(101_325)
    with pytest.raises(ValueError, match="unsupported unit"):
        normalize_process_value("temperature", "Pa", 25)
