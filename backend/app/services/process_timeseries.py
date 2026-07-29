from __future__ import annotations

import csv
from io import StringIO
from math import isfinite
from statistics import mean, median
from typing import Any

from app.core.scientific_units import normalize_process_value
from app.models.file_asset import FileAsset
from app.services.file_storage_service import FileStorageService

PARSER_VERSION = "process_timeseries_csv_v1"


class ProcessTimeseriesError(ValueError):
    pass


def project_process_timeseries(
    file_asset: FileAsset,
    storage: FileStorageService,
    channel_type: str,
    unit: str,
    excluded_ranges: list[dict[str, Any]],
    process_end_s: float,
) -> tuple[list[dict[str, float]], dict[str, float | int | str]]:
    if not file_asset.original_name.casefold().endswith(".csv"):
        raise ProcessTimeseriesError("time-series files must be CSV")
    try:
        content = storage.resolve(file_asset.storage_path).read_text(encoding="utf-8-sig")
        reader = csv.DictReader(StringIO(content))
        if not reader.fieldnames or not {"time_s", "value"}.issubset(reader.fieldnames):
            raise ProcessTimeseriesError("CSV requires time_s and value columns")
        points = [
            {
                "time_s": float(row["time_s"]),
                "value": float(normalize_process_value(channel_type, unit, float(row["value"]))),
            }
            for row in reader
            if row.get("time_s", "").strip() and row.get("value", "").strip()
        ]
    except (OSError, UnicodeError, csv.Error, TypeError, ValueError) as exc:
        if isinstance(exc, ProcessTimeseriesError):
            raise
        raise ProcessTimeseriesError("invalid process time-series CSV") from exc
    if any(not isfinite(point["time_s"]) or not isfinite(point["value"]) for point in points):
        raise ProcessTimeseriesError("time_s and value must be finite")
    times = [point["time_s"] for point in points]
    if len(points) < 2 or times != sorted(times) or len(times) != len(set(times)) or times[0] < 0:
        raise ProcessTimeseriesError("time_s must contain at least two unique ascending values")
    if times[-1] > process_end_s:
        raise ProcessTimeseriesError("time-series data extends beyond the process timeline")

    merged = _merge_ranges(excluded_ranges, times[0], times[-1])
    valid = [
        point
        for point in points
        if not any(start <= point["time_s"] <= end for start, end in merged)
    ]
    if not valid:
        raise ProcessTimeseriesError("all time-series points are excluded")
    values = [point["value"] for point in valid]
    for left, right in zip(points, points[1:], strict=False):
        for boundary in {
            value
            for excluded in merged
            for value in excluded
            if left["time_s"] < value < right["time_s"]
        }:
            values.append(
                left["value"]
                + (right["value"] - left["value"])
                * ((boundary - left["time_s"]) / (right["time_s"] - left["time_s"]))
            )
    rates = [
        (right["value"] - left["value"]) / ((right["time_s"] - left["time_s"]) / 60)
        for left, right in zip(points, points[1:], strict=False)
        if _valid_parts(left["time_s"], right["time_s"], merged)
    ]
    excluded_duration = sum(end - start for start, end in merged)
    duration = times[-1] - times[0]
    weighted_sum = 0.0
    weighted_duration = 0.0
    for left, right in zip(points, points[1:], strict=False):
        for start, end in _valid_parts(left["time_s"], right["time_s"], merged):
            span = right["time_s"] - left["time_s"]
            start_value = left["value"] + (right["value"] - left["value"]) * (
                (start - left["time_s"]) / span
            )
            end_value = left["value"] + (right["value"] - left["value"]) * (
                (end - left["time_s"]) / span
            )
            weighted_sum += ((start_value + end_value) / 2) * (end - start)
            weighted_duration += end - start
    intervals = [right - left for left, right in zip(times, times[1:], strict=False)]
    statistics: dict[str, float | int | str] = {
        "min": min(values),
        "max": max(values),
        "mean": mean(values),
        "median": median(values),
        "time_weighted_mean": weighted_sum / weighted_duration,
        "ramp_rate_per_min": max([rate for rate in rates if rate > 0], default=0),
        "cooling_rate_per_min": abs(min([rate for rate in rates if rate < 0], default=0)),
        "valid_duration_s": duration - excluded_duration,
        "excluded_duration_s": excluded_duration,
        "sampling_interval_s": median(intervals),
        "point_count": len(points),
        "valid_point_count": len(valid),
        "parser_version": PARSER_VERSION,
    }
    return points, statistics


def _merge_ranges(
    ranges: list[dict[str, Any]], minimum: float, maximum: float
) -> list[tuple[float, float]]:
    clipped = sorted(
        (
            max(minimum, float(item["start_s"])),
            min(maximum, float(item["end_s"])),
        )
        for item in ranges
        if float(item["end_s"]) > minimum and float(item["start_s"]) < maximum
    )
    merged: list[tuple[float, float]] = []
    for start, end in clipped:
        if start >= end:
            continue
        if merged and start <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(merged[-1][1], end))
        else:
            merged.append((start, end))
    return merged


def _valid_parts(
    start: float, end: float, excluded: list[tuple[float, float]]
) -> list[tuple[float, float]]:
    parts = [(start, end)]
    for excluded_start, excluded_end in excluded:
        parts = [
            candidate
            for left, right in parts
            for candidate in (
                (left, min(right, excluded_start)),
                (max(left, excluded_end), right),
            )
            if candidate[1] > candidate[0]
        ]
    return parts
