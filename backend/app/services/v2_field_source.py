from __future__ import annotations

import re
from datetime import datetime
from functools import lru_cache
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

import yaml

from app.core.config import get_settings

REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_FIELD_SOURCE = REPO_ROOT / "docs" / "standard" / "field-source.yaml"
SCHEMA_VERSION = "cvd_v2"
PAYLOAD_MODULE_KEYS = (
    "basic_info",
    "target_product",
    "equipment",
    "precursors",
    "substrates",
    "process_steps",
    "process_events",
)
ARRAY_MODULE_KEYS = {"precursors", "substrates", "process_steps", "process_events"}
RESULT_MODULE_KEYS = {"characterization", "measured_products"}
STRUCTURED_CONTROLLED_KEYS = {
    "field_type",
    "material",
    "measurement_source",
    "method",
    "operation_type",
    "placement",
    "shape",
    "species",
    "type",
}
ELEMENT_SYMBOLS = frozenset(
    "H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn "
    "Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce "
    "Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn "
    "Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc "
    "Lv Ts Og".split()
)
FORMULA_UNIT = (
    r"(?:[A-Z][a-z]?(?:\d+(?:\.\d+)?)?"
    r"|\((?:[A-Z][a-z]?(?:\d+(?:\.\d+)?)?)+\)(?:\d+(?:\.\d+)?)?)"
)
FORMULA_COMPONENT = rf"(?:{FORMULA_UNIT})+"
HYDRATED_FORMULA_COMPONENT = rf"{FORMULA_COMPONENT}(?:·(?:\d+)?{FORMULA_COMPONENT})*"
FORMULA_PATTERN = re.compile(
    rf"^{HYDRATED_FORMULA_COMPONENT}(?:[:/\-]{HYDRATED_FORMULA_COMPONENT})*$"
)
MATERIAL_FORMULA_PATTERN = re.compile(rf"^(?:\d+)?{HYDRATED_FORMULA_COMPONENT}$")
FORMULA_TRANSLATION = str.maketrans(
    {
        **dict(zip("₀₁₂₃₄₅₆₇₈₉", "0123456789", strict=True)),
        "∙": "·",
        "⋅": "·",
    }
)


@lru_cache(maxsize=4)
def _load_field_source_cached(path: str) -> dict[str, Any]:
    return yaml.safe_load(Path(path).read_text(encoding="utf-8"))


def load_field_source(path: str = str(DEFAULT_FIELD_SOURCE)) -> dict[str, Any]:
    settings = get_settings()
    # Dev reloads field metadata on every request so YAML edits appear without a restart.
    if settings.app_debug or settings.app_env.lower() in {"dev", "development"}:
        return yaml.safe_load(Path(path).read_text(encoding="utf-8"))
    return _load_field_source_cached(path)


def characterization_profiles(
    doc: dict[str, Any] | None = None,
) -> dict[str, dict[str, Any]]:
    return (doc or load_field_source())["characterization_profiles"]


def characterization_property_units(
    doc: dict[str, Any] | None = None,
) -> dict[str, str]:
    return (doc or load_field_source())["scientific_contract"]["property_units"]


def canonical_gas_species(value: str, doc: dict[str, Any] | None = None) -> str:
    normalized = value.strip().casefold()
    for code, definition in (doc or load_field_source())["gas_species"].items():
        if normalized in {str(alias).strip().casefold() for alias in definition["aliases"]}:
            return str(code)
    raise ValueError("unsupported gas species")


def experiment_fields(doc: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    source = doc or load_field_source()
    return [
        field for section in source["experiment_record"]["sections"] for field in section["fields"]
    ]


def entity_fields(doc: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    source = doc or load_field_source()
    return [field for section in source["entities"]["sections"] for field in section["fields"]]


def canonical_option_value(
    value: Any,
    doc: dict[str, Any] | None = None,
    *,
    field_key: str | None = None,
) -> Any:
    source = doc or load_field_source()
    if isinstance(value, list):
        return [canonical_option_value(item, source, field_key=field_key) for item in value]
    if not isinstance(value, str):
        return value
    field_aliases = source.get("field_option_codes", {}).get(field_key or "", {})
    if value in field_aliases:
        return field_aliases[value]
    return source.get("option_codes", {}).get(value, value)


def normalize_chemical_formula(value: str) -> str:
    if not isinstance(value, str):
        raise ValueError("invalid chemical formula")
    return re.sub(r"\s+", "", value.translate(FORMULA_TRANSLATION))


def validate_chemical_formula(value: str) -> str:
    normalized = normalize_chemical_formula(value)
    if not normalized or not FORMULA_PATTERN.fullmatch(normalized):
        raise ValueError("invalid chemical formula")
    symbols = re.findall(r"[A-Z][a-z]?", normalized)
    if not symbols or any(symbol not in ELEMENT_SYMBOLS for symbol in symbols):
        raise ValueError("invalid chemical formula")
    return normalized


def validate_material_formula(value: str) -> str:
    normalized = normalize_chemical_formula(value)
    if (
        not normalized
        or not MATERIAL_FORMULA_PATTERN.fullmatch(normalized)
        or any(symbol not in ELEMENT_SYMBOLS for symbol in re.findall(r"[A-Z][a-z]?", normalized))
    ):
        raise ValueError("invalid material formula")
    return normalized


def normalize_offset_datetime(value: object) -> datetime:
    if isinstance(value, str):
        raw = value.strip()
        if not re.match(r"^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}", raw):
            raise ValueError("invalid ISO datetime")
        try:
            parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        except ValueError as exc:
            raise ValueError("invalid ISO datetime") from exc
    elif isinstance(value, datetime):
        parsed = value
    else:
        raise ValueError("invalid ISO datetime")
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        parsed = parsed.replace(tzinfo=ZoneInfo(get_settings().experiment_timezone))
    return parsed


def _option_tokens(field: dict[str, Any]) -> list[str]:
    options = str(field.get("options") or "").strip()
    if not options or options == "—":
        return []
    input_type = str(field.get("input") or "")
    # Structured controls describe object members with separators such as `/` and
    # `|`; those are not a flat choice list. Their generated Pydantic models own
    # the vocabulary and shape instead of guessing options from display prose.
    if not any(token in input_type for token in ("下拉", "多选")):
        return []
    if input_type in {"数值+下拉", "下拉+数值", "文本+下拉", "下拉+文本"}:
        segments = [part.strip() for part in options.replace(" + ", "；").split("；")]
        options = next((part for part in segments if "/" in part), segments[0])
    separator = "·" if "·" in options else "/"
    return [value.strip() for value in options.split(separator) if value.strip()]


def field_option_values(field_key: str, doc: dict[str, Any] | None = None) -> set[str]:
    source = doc or load_field_source()
    field = next(
        (
            item
            for item in [*experiment_fields(source), *entity_fields(source)]
            if item["key"] == field_key
        ),
        None,
    )
    if field is None:
        # 快速失败：键名拼错/YAML 改名时立刻暴露，而不是静默空集导致所有值被拒
        raise ValueError(f"field-source.yaml 中不存在字段 key: {field_key}")
    return {
        canonical_option_value(value, source, field_key=field_key)
        for value in _option_tokens(field)
    }


def canonicalize_controlled_values(
    value: Any,
    doc: dict[str, Any] | None = None,
    *,
    key: str | None = None,
) -> Any:
    """Canonicalize legacy controlled labels without rewriting narrative text."""
    source = doc or load_field_source()
    controlled_keys = {
        field["key"]
        for field in [*experiment_fields(source), *entity_fields(source)]
        if any(token in str(field.get("input") or "") for token in ("下拉", "多选", "多条"))
    } | {
        "role",
        "option",
        "file_kind",
        "observed_phenomenon",
        *STRUCTURED_CONTROLLED_KEYS,
    }
    if isinstance(value, dict):
        return {
            item_key: canonicalize_controlled_values(
                item,
                source,
                key=item_key,
            )
            for item_key, item in value.items()
        }
    if isinstance(value, list):
        return [canonicalize_controlled_values(item, source, key=key) for item in value]
    if not isinstance(value, str) or key is None:
        return value
    normalized_key = key.removeprefix("source_").removesuffix("_snapshot")
    if normalized_key in controlled_keys:
        return canonical_option_value(value, source, field_key=normalized_key)
    return value


def module_key_for_field(field: dict[str, Any], doc: dict[str, Any] | None = None) -> str:
    source = doc or load_field_source()
    module = field["module"]
    return source["modules"].get(module) or source["entity_keys"][module]


def payload_fields_by_module(doc: dict[str, Any] | None = None) -> dict[str, list[dict[str, Any]]]:
    grouped: dict[str, list[dict[str, Any]]] = {key: [] for key in PAYLOAD_MODULE_KEYS}
    source = doc or load_field_source()
    for field in experiment_fields(source):
        module_key = module_key_for_field(field, source)
        if module_key in grouped:
            grouped[module_key].append(field)
    return grouped


def entity_fields_by_key(doc: dict[str, Any] | None = None) -> dict[str, list[dict[str, Any]]]:
    source = doc or load_field_source()
    grouped = {value: [] for value in source["entity_keys"].values()}
    for field in entity_fields(source):
        grouped[module_key_for_field(field, source)].append(field)
    return grouped


def missing(value: Any) -> bool:
    if value is None:
        return True
    if isinstance(value, str):
        return not value.strip()
    if isinstance(value, (list, tuple, set)):
        return not value or all(missing(item) for item in value)
    if isinstance(value, dict):
        return not value or all(missing(item) for item in value.values())
    return False


def condition_local_key(
    field: dict[str, Any],
    condition: dict[str, Any] | None,
    doc: dict[str, Any] | None = None,
) -> str | None:
    if not condition:
        return None
    source = doc or load_field_source()
    raw_field = str(condition.get("field") or "")
    if "." not in raw_field:
        return None
    condition_module, condition_label = raw_field.split(".", 1)
    current_module_key = module_key_for_field(field, source)
    condition_module_key = source["modules"].get(condition_module) or source["entity_keys"].get(
        condition_module
    )
    if condition_module_key != current_module_key:
        return None

    candidates = (
        experiment_fields(source)
        if current_module_key in source["modules"].values()
        else entity_fields(source)
    )
    for candidate in candidates:
        if (
            module_key_for_field(candidate, source) == current_module_key
            and candidate["label"] == condition_label
        ):
            return candidate["key"]
    return None


def condition_matches(condition: dict[str, Any], value: Any) -> bool:
    if missing(value):
        return False
    op = condition.get("op")
    expected = canonical_option_value(condition.get("value"))
    value = canonical_option_value(value)
    if isinstance(value, list):
        if op == "eq":
            return expected in value
        if op == "ne":
            return expected not in value
        if op == "in":
            return any(item in set(expected or []) for item in value)
    if op == "eq":
        return value == expected
    if op == "ne":
        return value != expected
    if op == "in":
        return value in set(expected or [])
    msg = f"Unsupported condition op: {op}"
    raise ValueError(msg)
