"""Optical instrument catalogs and immutable selections, using the field source."""

import re
from copy import deepcopy

from app.schemas.scientific import MeasurementConditions, validate_profile_conditions
from app.services.v2_field_source import load_field_source


def resolve_om_configuration(
    catalog: dict, selection: dict, digital: bool = True, method: str = "optical_microscopy"
) -> tuple[dict, set]:
    config = load_field_source()[
        f"{method.lower()}_configuration" if method in {"Raman", "PL"} else "om_configuration"
    ]
    spec = config["sections"]
    if set(selection) - set(spec):
        raise ValueError("unknown instrument configuration selection")
    required = set(config.get("required_sections", ["objectives", "optics"]))
    if method == "optical_microscopy" and digital:
        required.add("cameras")
    if not required <= selection.keys():
        raise ValueError("select the required instrument configurations")
    if not digital and set(selection) & {"cameras", "scales"}:
        raise ValueError("visual observation does not use camera or image scale configurations")
    values, adjustable = {}, set()
    for section in spec:
        if section not in selection:
            continue
        entry = next(
            (item for item in catalog.get(section, []) if item["name"] == selection[section]), None
        )
        if entry is None:
            raise ValueError("instrument configuration does not belong to this instrument version")
        if any(selection.get(key) != name for key, name in entry.get("references", {}).items()):
            raise ValueError("configuration references do not match the selected components")
        for key, value in entry["conditions"].items():
            if key in values and values[key] != value and key not in adjustable:
                raise ValueError("inconsistent fixed instrument configurations")
            values[key] = value
        if field := spec[section].get("name_field"):
            values[field] = entry["name"]
        adjustable.update(entry.get("adjustable", []))
        if section == "scales":
            adjustable.difference_update(entry["conditions"])
    return values, adjustable


def validate_om_catalog(catalog: dict, method: str = "optical_microscopy") -> dict:
    spec = load_field_source()[
        f"{method.lower()}_configuration" if method in {"Raman", "PL"} else "om_configuration"
    ]
    if not isinstance(catalog, dict) or set(catalog) - set(spec["sections"]):
        raise ValueError("invalid instrument catalog")
    catalog = deepcopy(catalog)
    for section, definition in spec["sections"].items():
        entries = catalog.get(section, [])
        if not isinstance(entries, list) or len(entries) > spec["max_entries"]:
            raise ValueError("invalid instrument catalog entries")
        if section in spec.get("required_sections", ["objectives", "optics"]) and not entries:
            raise ValueError("register the required instrument configurations")
        names = set()
        for entry in entries:
            if not isinstance(entry, dict) or set(entry) - {
                "name",
                "conditions",
                "adjustable",
                "references",
                "native_extensions",
                "mode_options",
            }:
                raise ValueError("invalid instrument catalog entry")
            name = entry.get("name")
            if (
                not isinstance(name, str)
                or not 1 <= len(name.strip()) <= 128
                or name.strip().lower() in names
            ):
                raise ValueError("instrument configuration names must be nonempty and unique")
            entry["name"] = name.strip()
            modes = entry.get("mode_options", {})
            if (
                not isinstance(modes, dict)
                or set(modes) - {"exposure_mode", "white_balance_mode"}
                or (modes and section != "cameras")
            ):
                raise ValueError("invalid camera mode options")
            for key, options in modes.items():
                field = next(
                    field
                    for field in load_field_source()["characterization_profiles"][
                        "optical_microscopy"
                    ]["condition_fields"]
                    if field["key"] == key
                )
                allowed = {option["value"] for option in field["options"]}
                if (
                    not isinstance(options, list)
                    or not options
                    or any(
                        not isinstance(option, str) or option not in allowed for option in options
                    )
                    or len(set(options)) != len(options)
                ):
                    raise ValueError("select the camera's supported modes")
            extensions = entry.get("native_extensions", [])
            if (
                not isinstance(extensions, list)
                or len(extensions) > 20
                or any(
                    not isinstance(ext, str) or not re.fullmatch(r"\.[a-z0-9]{1,12}", ext)
                    for ext in extensions
                )
            ):
                raise ValueError("invalid native file extensions")
            if extensions and section != "cameras":
                raise ValueError("native extensions belong to a camera configuration")
            names.add(name.strip().lower())
            conditions = entry.get("conditions")
            if not isinstance(conditions, dict) or set(conditions) - set(definition["fields"]):
                raise ValueError("invalid instrument configuration fields")
            if not set(definition["required"]) <= conditions.keys() or any(
                v is None for v in conditions.values()
            ):
                raise ValueError("complete the required instrument configuration fields")
            normalized = MeasurementConditions.model_validate(conditions).model_dump(
                exclude_none=True
            )
            context = (
                {"observation_mode": "digital"} if method == "optical_microscopy" else {}
            ) | normalized
            validate_profile_conditions(method, context, require_complete=False)
            for field in load_field_source()["characterization_profiles"][method][
                "condition_fields"
            ]:
                if (
                    field.get("required_when")
                    and all(
                        context.get(k) in values for k, values in field["required_when"].items()
                    )
                    and field["key"] not in context
                ):
                    raise ValueError(f"complete configuration field {field['key']}")
            if normalized.get("contrast_method") == "other" and not normalized.get(
                "contrast_method_other"
            ):
                raise ValueError("name the other contrast method")
            entry["conditions"] = normalized
            adjustable = entry.get("adjustable", [])
            if (
                not isinstance(adjustable, list)
                or any(
                    not isinstance(k, str) or k not in definition["adjustable"] for k in adjustable
                )
                or len(set(adjustable)) != len(adjustable)
            ):
                raise ValueError("invalid adjustable OM fields")
            references = entry.get("references", {})
            if not isinstance(references, dict) or set(references) != set(
                definition.get("references", [])
            ):
                raise ValueError("select the referenced instrument configuration")
            for key, ref in references.items():
                if not any(item.get("name", "").strip() == ref for item in catalog.get(key, [])):
                    raise ValueError("unknown instrument configuration reference")
    for scale in catalog.get("scales", []):
        resolve_om_configuration(catalog, {**scale["references"], "scales": scale["name"]}, True)
    return catalog
