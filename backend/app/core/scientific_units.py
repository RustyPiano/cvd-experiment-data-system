from __future__ import annotations

from typing import Any

_NUMERIC_UNITS: dict[str, tuple[str, dict[str, tuple[float, float]]]] = {
    "temperature": (
        "°C",
        {"°C": (1, 0), "℃": (1, 0), "C": (1, 0), "K": (1, -273.15)},
    ),
    "pressure": (
        "Pa",
        {
            "Pa": (1, 0),
            "kPa": (1_000, 0),
            "mbar": (100, 0),
            "Torr": (133.32236842105263, 0),
            "bar": (100_000, 0),
            "atm": (101_325, 0),
        },
    ),
    "flow": ("sccm", {"sccm": (1, 0), "slm": (1_000, 0)}),
    "source_position": ("mm", {"mm": (1, 0), "cm": (10, 0), "m": (1_000, 0)}),
    "furnace_position": ("mm", {"mm": (1, 0), "cm": (10, 0), "m": (1_000, 0)}),
    "plasma_power": ("W", {"W": (1, 0), "kW": (1_000, 0)}),
}
_STATE_CHANNELS = {"valve_state", "shutter_state"}

ALLOWED_PROCESS_UNITS = {
    channel_type: tuple(conversions)
    for channel_type, (_canonical, conversions) in _NUMERIC_UNITS.items()
} | {channel_type: ("state",) for channel_type in _STATE_CHANNELS}


def validate_process_unit(channel_type: str, unit: str) -> None:
    if unit not in ALLOWED_PROCESS_UNITS.get(channel_type, ()):
        allowed = ", ".join(ALLOWED_PROCESS_UNITS.get(channel_type, ()))
        raise ValueError(f"unsupported unit {unit!r} for {channel_type}; allowed: {allowed}")


def normalize_process_value(channel_type: str, unit: str, value: Any) -> float | str | bool:
    validate_process_unit(channel_type, unit)
    if channel_type in _STATE_CHANNELS:
        if not isinstance(value, str | bool):
            raise ValueError(f"{channel_type} requires a string/bool value with unit 'state'")
        return value
    definition = _NUMERIC_UNITS.get(channel_type)
    if definition is None:
        raise ValueError(f"unsupported channel type {channel_type!r}")
    if not isinstance(value, int | float) or isinstance(value, bool):
        raise ValueError(f"{channel_type} requires numeric values")
    scale, offset = definition[1][unit]
    return (float(value) * scale) + offset


def canonicalize_process_channel(
    channel: dict[str, Any],
) -> tuple[str, float | None, list[dict[str, Any]] | None, str]:
    channel_type = channel["channel_type"]
    unit = channel["unit"]
    canonical_unit = "state" if channel_type in _STATE_CHANNELS else _NUMERIC_UNITS[channel_type][0]
    if channel["data_kind"] == "timeseries_file":
        return canonical_unit, None, None, "unavailable"
    scalar = channel.get("scalar_value")
    canonical_scalar = (
        float(normalize_process_value(channel_type, unit, scalar)) if scalar is not None else None
    )
    series = channel.get("series")
    canonical_series = (
        [
            {
                **point,
                "value": normalize_process_value(channel_type, unit, point["value"]),
            }
            for point in series
        ]
        if series
        else None
    )
    return canonical_unit, canonical_scalar, canonical_series, "ready"
