from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from app.schemas.generated.v2_module_payload import (
    V2_ENTITY_PAYLOAD_MODELS,
    V2_MODULE_PAYLOAD_MODELS,
    V2_MODULE_PAYLOAD_SCHEMA_VERSION,
)
from app.schemas.scientific import (
    DatasetQuery,
    MeasurementBundleCreate,
    ProcessTimelinePayload,
    ScientificBasicInfo,
    ScientificProcessEventsPayload,
    SourceLoadsPayload,
    TargetSpecPayload,
    TransformationRunCreate,
)
from app.services.v2_field_source import (
    DEFAULT_FIELD_SOURCE,
    SCHEMA_VERSION,
    canonical_option_value,
    entity_fields,
    experiment_fields,
    load_field_source,
    module_key_for_field,
)

REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_OUTPUT_DIR = REPO_ROOT / "docs" / "standard" / "generated"
STANDARD_ID = "cvd-2d-process"
JSON_SCHEMA_DIALECT = "https://json-schema.org/draft/2020-12/schema"
RELEASED_MODULE_PAYLOAD_MODELS = {
    **V2_MODULE_PAYLOAD_MODELS,
    "basic_info": ScientificBasicInfo,
    "target_product": TargetSpecPayload,
    "precursors": SourceLoadsPayload,
    "process_steps": ProcessTimelinePayload,
    "process_events": ScientificProcessEventsPayload,
}


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Export cvd_v2 JSON Schema artifacts.")
    parser.add_argument("--field-source", default=str(DEFAULT_FIELD_SOURCE))
    parser.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR))
    return parser


def export_v2_schema(
    *,
    field_source: str | Path = DEFAULT_FIELD_SOURCE,
    output_dir: str | Path | None = DEFAULT_OUTPUT_DIR,
) -> dict[str, Any]:
    doc = load_field_source(str(field_source))
    schema = build_v2_json_schema(doc)
    field_dictionary = build_v2_field_dictionary(doc)

    result: dict[str, Any] = {
        "json_schema_doc": schema,
        "field_dictionary_doc": field_dictionary,
    }
    if output_dir is None:
        return result

    directory = Path(output_dir)
    directory.mkdir(parents=True, exist_ok=True)
    schema_path = directory / "cvd-2d-process-v2.schema.json"
    dictionary_path = directory / "cvd-2d-field-dictionary-v2.json"
    schema_path.write_text(
        json.dumps(schema, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    dictionary_path.write_text(
        json.dumps(field_dictionary, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    result.update({"json_schema": str(schema_path), "field_dictionary_json": str(dictionary_path)})
    return result


def build_v2_json_schema(doc: dict[str, Any] | None = None) -> dict[str, Any]:
    source = doc or load_field_source()
    release_version = str(source["meta"]["version"])
    schema_base_uri = f"https://standard.cvd-2d.org/{release_version}"
    modules: dict[str, Any] = {}
    for module_key, model in RELEASED_MODULE_PAYLOAD_MODELS.items():
        module_schema = model.model_json_schema()
        module_schema["$id"] = f"{schema_base_uri}/{module_key}.schema.json"
        modules[module_key] = module_schema
    measurement_schema = MeasurementBundleCreate.model_json_schema()
    _apply_characterization_contract(measurement_schema, source)
    result_models = {
        "measurement_bundle": measurement_schema,
        "transformation": TransformationRunCreate.model_json_schema(),
        "dataset_query": DatasetQuery.model_json_schema(),
    }
    entity_models = {
        kind: model.model_json_schema() for kind, model in V2_ENTITY_PAYLOAD_MODELS.items()
    }
    return {
        "$schema": JSON_SCHEMA_DIALECT,
        "standard_id": STANDARD_ID,
        "title": "CVD-2D 科学数据契约 / CVD-2D Scientific Data Contract",
        "version": release_version,
        "status": source["meta"]["status"],
        "schema_version": SCHEMA_VERSION,
        "module_payload_schema_version": V2_MODULE_PAYLOAD_SCHEMA_VERSION,
        "scientific_contract": source["scientific_contract"],
        "characterization_properties": source["characterization_properties"],
        "characterization_profiles": source["characterization_profiles"],
        "modules": modules,
        "entities": entity_models,
        "result_models": result_models,
    }


def build_v2_field_dictionary(doc: dict[str, Any]) -> dict[str, Any]:
    rows = [
        _field_dictionary_row(doc, "experiment_record", field)
        for field in experiment_fields(doc)
        if field["requirement"]["level"] != "none"
    ]
    rows.extend(
        _field_dictionary_row(doc, "entity", field)
        for field in entity_fields(doc)
        if field["requirement"]["level"] != "none"
    )
    return {
        "standard_id": STANDARD_ID,
        "version": doc["meta"]["version"],
        "status": doc["meta"]["status"],
        "schema_version": SCHEMA_VERSION,
        "characterization_properties": {
            code: {
                **definition,
                "unit": doc["scientific_contract"]["property_units"][code],
            }
            for code, definition in doc["characterization_properties"].items()
        },
        "characterization_profiles": doc["characterization_profiles"],
        "fields": rows,
        "field_count": len(rows),
    }


def _apply_characterization_contract(
    schema: dict[str, Any],
    source: dict[str, Any],
    *,
    definitions: dict[str, Any] | None = None,
) -> None:
    """Add the cross-field rules that Pydantic model validators cannot emit."""
    model_schemas = definitions or schema["$defs"]
    condition_schema = model_schemas["MeasurementConditions"]
    condition_schema.setdefault("allOf", []).extend(
        [
            {
                "if": {
                    "required": ["excitation_power_basis"],
                    "properties": {"excitation_power_basis": {"const": "instrument_percent"}},
                },
                "then": {"properties": {"excitation_power_value": {"maximum": 100}}},
            },
            {
                "oneOf": [
                    {
                        "properties": {
                            "excitation_power_value": {"type": "null"},
                            "excitation_power_basis": {"type": "null"},
                        }
                    },
                    {
                        "required": ["excitation_power_value", "excitation_power_basis"],
                        "properties": {
                            "excitation_power_value": {"type": "number"},
                            "excitation_power_basis": {"type": "string"},
                        },
                    },
                ]
            },
        ]
    )
    property_schema = model_schemas["PropertyValueWrite"]
    property_schema.setdefault("allOf", []).extend(
        [
            {
                "oneOf": [
                    _property_value_schema(
                        code,
                        definition,
                        source["scientific_contract"]["property_units"][code],
                    )
                    for code, definition in source["characterization_properties"].items()
                ]
            },
            {
                "oneOf": [
                    {
                        "properties": {
                            "uncertainty_value": {"type": "null"},
                            "uncertainty_type": {"type": "null"},
                        }
                    },
                    {
                        "required": ["uncertainty_value", "uncertainty_type"],
                        "properties": {
                            "uncertainty_value": {"type": "number", "minimum": 0},
                            "uncertainty_type": {"type": "string", "maxLength": 64},
                        },
                    },
                ]
            },
            {
                "if": {
                    "required": ["quality_flag"],
                    "properties": {"quality_flag": {"const": "below_detection_limit"}},
                },
                "then": {
                    "required": ["numeric_value"],
                    "properties": {"numeric_value": {"type": "number"}},
                },
            },
        ]
    )
    schema.setdefault("allOf", []).extend(
        [
            {
                "oneOf": [
                    _measurement_profile_schema(code, profile)
                    for code, profile in source["characterization_profiles"].items()
                ]
            },
            {
                "anyOf": [
                    {
                        "required": ["measurement"],
                        "properties": {
                            "measurement": {
                                "required": ["raw_file_ids"],
                                "properties": {"raw_file_ids": {"minItems": 1}},
                            }
                        },
                    },
                    {"required": ["properties"], "properties": {"properties": {"minItems": 1}}},
                    {"required": ["assertions"], "properties": {"assertions": {"minItems": 1}}},
                ]
            },
        ]
    )
    model_schemas["MeasurementRunCreate"]["properties"]["raw_file_ids"]["uniqueItems"] = True
    _apply_sample_region_contract(model_schemas["SampleRegion"])
    _apply_analysis_contract(model_schemas["AnalysisRunCreate"])
    _apply_assertion_contract(model_schemas["MaterialAssertionWrite"])


def apply_characterization_openapi_contract(
    openapi_schema: dict[str, Any],
    source: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Apply the published measurement rules to FastAPI's component schemas."""
    schemas = openapi_schema["components"]["schemas"]
    _apply_characterization_contract(
        schemas["MeasurementBundleCreate"],
        source or load_field_source(),
        definitions=schemas,
    )
    return openapi_schema


def _nullable_properties(*keys: str) -> dict[str, Any]:
    return {key: {"type": "null"} for key in keys}


def _apply_sample_region_contract(schema: dict[str, Any]) -> None:
    schema.setdefault("allOf", []).extend(
        [
            {
                "if": {
                    "required": ["geometry_type"],
                    "properties": {"geometry_type": {"const": "point"}},
                },
                "then": {"properties": _nullable_properties("width", "height")},
            },
            {
                "if": {
                    "required": ["geometry_type"],
                    "properties": {"geometry_type": {"const": "line"}},
                },
                "then": {
                    "required": ["width"],
                    "properties": {
                        "width": {"type": "number", "exclusiveMinimum": 0},
                        "height": {"type": "null"},
                    },
                },
            },
            {
                "if": {
                    "required": ["geometry_type"],
                    "properties": {"geometry_type": {"const": "area"}},
                },
                "then": {
                    "required": ["width", "height"],
                    "properties": {
                        "width": {"type": "number", "exclusiveMinimum": 0},
                        "height": {"type": "number", "exclusiveMinimum": 0},
                    },
                },
            },
            {
                "if": {
                    "required": ["geometry_type"],
                    "properties": {
                        "geometry_type": {"enum": ["whole_sample", "lamella", "particle"]}
                    },
                },
                "then": {"properties": _nullable_properties("x", "y", "width", "height")},
            },
            {
                "if": {
                    "required": ["geometry_type"],
                    "properties": {"geometry_type": {"const": "selected_area"}},
                },
                "then": {"properties": _nullable_properties("width", "height")},
            },
            *[
                {
                    "if": {
                        "required": [source],
                        "properties": {source: {"type": "number"}},
                    },
                    "then": {
                        "required": [target],
                        "properties": {target: {"type": "number"}},
                    },
                }
                for source, target in (("x", "y"), ("y", "x"))
            ],
            *[
                {
                    "if": {
                        "required": [key],
                        "properties": {key: {"type": "number"}},
                    },
                    "then": {
                        "required": ["unit"],
                        "properties": {"unit": {"type": "string", "pattern": r"\S"}},
                    },
                }
                for key in ("x", "y", "width", "height")
            ],
            {
                "if": {
                    "required": ["unit"],
                    "properties": {"unit": {"type": "string"}},
                },
                "then": {
                    "anyOf": [
                        {
                            "required": [key],
                            "properties": {key: {"type": "number"}},
                        }
                        for key in ("x", "y", "width", "height")
                    ]
                },
            },
            *[
                {
                    "if": {
                        "required": [source],
                        "properties": {source: source_schema},
                    },
                    "then": {
                        "required": [target],
                        "properties": {target: target_schema},
                    },
                }
                for source, source_schema, target, target_schema in (
                    (
                        "image_file_id",
                        {"type": "string"},
                        "pixel_roi",
                        {"type": "object"},
                    ),
                    (
                        "pixel_roi",
                        {"type": "object"},
                        "image_file_id",
                        {"type": "string", "format": "uuid"},
                    ),
                )
            ],
        ]
    )


def _apply_analysis_contract(schema: dict[str, Any]) -> None:
    schema["properties"]["input_file_ids"]["uniqueItems"] = True
    schema["properties"]["output_file_ids"]["uniqueItems"] = True


def _assertion_value_schema(
    assertion_type: str,
    key: str,
    value_schema: dict[str, Any],
) -> dict[str, Any]:
    return {
        "required": ["assertion_type", "value"],
        "properties": {
            "assertion_type": {"const": assertion_type},
            "value": {
                "type": "object",
                "additionalProperties": False,
                "properties": {key: value_schema},
                "required": [key],
            },
        },
    }


def _apply_assertion_contract(schema: dict[str, Any]) -> None:
    text_value = {"type": "string", "pattern": r"\S", "maxLength": 256}
    schema.setdefault("allOf", []).append(
        {
            "oneOf": [
                _assertion_value_schema(
                    "growth_presence",
                    "state",
                    {"enum": ["present", "absent", "uncertain"]},
                ),
                _assertion_value_schema("phase_identity", "phase", text_value),
                _assertion_value_schema("polytype", "polytype", text_value),
                _assertion_value_schema("stacking_order", "stacking_order", text_value),
                _assertion_value_schema(
                    "orientation_relationship", "orientation_relationship", text_value
                ),
                _assertion_value_schema("layer_count", "count", {"type": "integer", "minimum": 0}),
                {
                    "required": ["assertion_type", "value"],
                    "properties": {
                        "assertion_type": {"const": "composition"},
                        "value": {
                            "type": "object",
                            "additionalProperties": False,
                            "properties": {
                                "basis": {
                                    "enum": [
                                        "site_fraction",
                                        "atomic_fraction",
                                        "mass_fraction",
                                    ]
                                },
                                "components": {
                                    "type": "array",
                                    "minItems": 1,
                                    "items": {
                                        "type": "object",
                                        "additionalProperties": False,
                                        "properties": {
                                            "species": {
                                                "type": "string",
                                                "pattern": r"\S",
                                                "maxLength": 128,
                                            },
                                            "fraction": {
                                                "type": "number",
                                                "minimum": 0,
                                                "maximum": 1,
                                            },
                                        },
                                        "required": ["species", "fraction"],
                                    },
                                },
                            },
                            "required": ["basis", "components"],
                        },
                    },
                },
            ]
        }
    )


def _property_value_schema(
    code: str,
    definition: dict[str, Any],
    unit: str,
) -> dict[str, Any]:
    value_type = definition["value_type"]
    properties: dict[str, Any] = {
        "property_code": {"const": code},
        "numeric_value": {"type": "null"},
        "text_value": {"type": "null"},
        "structured_value": {"type": "null"},
        "unit": {"type": "null"},
    }
    required = ["property_code"]
    if value_type == "numeric":
        value_schema: dict[str, Any] = {"type": "number"}
        for source_key, schema_key in {
            "ge": "minimum",
            "gt": "exclusiveMinimum",
            "le": "maximum",
            "lt": "exclusiveMaximum",
        }.items():
            if source_key in definition["validation"]:
                value_schema[schema_key] = definition["validation"][source_key]
        properties["numeric_value"] = value_schema
        properties["unit"] = {"const": unit, "type": "string"}
        required.extend(["numeric_value", "unit"])
    elif value_type == "text":
        validation = definition["validation"]
        properties["text_value"] = {
            "type": "string",
            "pattern": r"\S",
            **({"minLength": validation["min_length"]} if "min_length" in validation else {}),
            **({"maxLength": validation["max_length"]} if "max_length" in validation else {}),
        }
        required.append("text_value")
    else:
        properties["structured_value"] = definition.get(
            "structured_schema", {"type": "object", "minProperties": 1}
        )
        required.append("structured_value")
    if value_type != "numeric":
        properties.update(
            {
                "uncertainty_value": {"type": "null"},
                "uncertainty_type": {"type": "null"},
            }
        )
    return {"properties": properties, "required": required}


def _measurement_profile_schema(code: str, profile: dict[str, Any]) -> dict[str, Any]:
    measurement_properties: dict[str, Any] = {
        "method_profile": {"const": code},
        "typed_conditions": {
            "type": "object",
            "properties": {
                item["key"]: _condition_field_schema(item) for item in profile["condition_fields"]
            },
            "required": profile["required_condition_keys"],
            "additionalProperties": False,
        },
        "sample_region": {
            "type": ["object", "null"],
            "properties": {"geometry_type": {"enum": profile["allowed_region_types"]}},
            "required": ["geometry_type"],
        },
    }
    typed_schema = measurement_properties["typed_conditions"]
    typed_schema["allOf"] = [
        {
            "if": {
                "required": [field["key"]],
                "properties": {field["key"]: {"not": {"type": "null"}}},
            },
            "then": {
                "required": list(field["when"]),
                "properties": {key: {"enum": values} for key, values in field["when"].items()},
            },
        }
        for field in profile["condition_fields"]
        if field.get("when")
    ]
    measurement_required = ["method_profile", "typed_conditions"]
    if profile["raw_files_required"]:
        measurement_properties["raw_file_ids"] = {"type": "array", "minItems": 1}
        measurement_required.append("raw_file_ids")
    instrument_pair = {
        "instrument_id": {"type": "string", "format": "uuid"},
        "instrument_version": {"type": "integer", "minimum": 1},
    }
    if profile["instrument_required"]:
        measurement_properties.update(instrument_pair)
        measurement_required.extend(instrument_pair)
        instrument_contract: dict[str, Any] = {}
    else:
        instrument_contract = {
            "oneOf": [
                {
                    "properties": {
                        "instrument_id": {"type": "null"},
                        "instrument_version": {"type": "null"},
                    }
                },
                {
                    "required": list(instrument_pair),
                    "properties": instrument_pair,
                },
            ]
        }

    allowed_properties = profile["allowed_property_codes"]
    allowed_assertions = profile["allowed_assertion_types"]
    result = {
        "properties": {
            "measurement": {
                "properties": measurement_properties,
                "required": measurement_required,
                **instrument_contract,
            },
            "properties": (
                {"items": {"properties": {"property_code": {"enum": allowed_properties}}}}
                if allowed_properties
                else {"maxItems": 0}
            ),
            "assertions": (
                {"items": {"properties": {"assertion_type": {"enum": allowed_assertions}}}}
                if allowed_assertions
                else {"maxItems": 0}
            ),
        }
    }

    constraints = []
    for property_code, conditions in profile.get("property_conditions", {}).items():
        constraints.append(
            {
                "if": {
                    "required": ["properties"],
                    "properties": {
                        "properties": {
                            "contains": {
                                "required": ["property_code"],
                                "properties": {"property_code": {"const": property_code}},
                            }
                        }
                    },
                },
                "then": {
                    "properties": {
                        "measurement": {
                            "properties": {
                                "typed_conditions": {
                                    "required": list(conditions),
                                    "properties": {
                                        key: {"enum": values} for key, values in conditions.items()
                                    },
                                }
                            }
                        }
                    }
                },
            }
        )
    if code == "XRD":
        for axis, unit in {"two_theta": "° 2θ", "omega": "° ω", "phi": "° φ", "chi": "° χ"}.items():
            constraints.append(
                {
                    "if": {
                        "properties": {
                            "measurement": {
                                "properties": {
                                    "typed_conditions": {
                                        "required": ["scan_axis"],
                                        "properties": {"scan_axis": {"const": axis}},
                                    }
                                }
                            }
                        }
                    },
                    "then": {
                        "properties": {
                            "properties": {
                                "items": {
                                    "if": {
                                        "properties": {"property_code": {"const": "spectral_peaks"}}
                                    },
                                    "then": {
                                        "properties": {
                                            "structured_value": {
                                                "properties": {
                                                    "position_unit": {"const": unit},
                                                    **(
                                                        {
                                                            "peaks": {
                                                                "items": {
                                                                    "properties": {
                                                                        "d_spacing_nm": False
                                                                    }
                                                                }
                                                            }
                                                        }
                                                        if axis != "two_theta"
                                                        else {}
                                                    ),
                                                }
                                            }
                                        }
                                    },
                                }
                            }
                        }
                    },
                }
            )
        typed_schema["allOf"].append(
            {
                "if": {
                    "properties": {"scan_axis": {"const": "two_theta"}},
                    "required": ["scan_axis"],
                },
                "then": {
                    "properties": {
                        "scan_range_deg": {
                            "properties": {"start": {"minimum": 0}, "end": {"maximum": 180}}
                        }
                    }
                },
            }
        )
    for property_code, modes in profile.get("property_modes", {}).items():
        constraints.append(
            {
                "if": {
                    "required": ["properties"],
                    "properties": {
                        "properties": {
                            "contains": {
                                "required": ["property_code"],
                                "properties": {"property_code": {"const": property_code}},
                            }
                        },
                    },
                },
                "then": {
                    "properties": {
                        "measurement": {
                            "properties": {
                                "typed_conditions": {
                                    "required": ["mode"],
                                    "properties": {"mode": {"enum": modes}},
                                },
                            }
                        }
                    }
                },
            }
        )
    for property_code, required_keys in {
        "image_object_size_um": ["image_object_type", "image_size_metric"],
        "image_object_density_cm2": ["image_object_type"],
    }.items():
        if property_code in allowed_properties:
            constraints.append(
                {
                    "if": {
                        "required": ["properties"],
                        "properties": {
                            "properties": {
                                "contains": {
                                    "required": ["property_code"],
                                    "properties": {"property_code": {"const": property_code}},
                                }
                            },
                        },
                    },
                    "then": {
                        "properties": {
                            "measurement": {
                                "properties": {
                                    "typed_conditions": {"required": required_keys},
                                }
                            }
                        }
                    },
                }
            )
    if "spectral_peaks" in allowed_properties:
        peak_properties = {"position_unit": {"enum": profile["peak_position_units"]}}
        if code != "XRD":
            peak_properties["peaks"] = {"items": {"properties": {"d_spacing_nm": False}}}
        constraints.append(
            {
                "properties": {
                    "properties": {
                        "items": {
                            "if": {"properties": {"property_code": {"const": "spectral_peaks"}}},
                            "then": {
                                "properties": {"structured_value": {"properties": peak_properties}}
                            },
                        }
                    }
                }
            }
        )
    if not typed_schema["allOf"]:
        typed_schema.pop("allOf")
    if constraints:
        result["allOf"] = constraints
    return result


def _condition_field_schema(field: dict[str, Any]) -> dict[str, Any]:
    validation = field.get("validation") or {}
    result: dict[str, Any] = {
        "type": {
            "text": "string",
            "select": "string",
            "number": "number",
            "integer": "integer",
            "range": "object",
            "size": "object",
            "resolution": "object",
        }[field["value_type"]]
    }
    for source_key, schema_key in {
        "ge": "minimum",
        "gt": "exclusiveMinimum",
        "le": "maximum",
        "lt": "exclusiveMaximum",
        "min_length": "minLength",
        "max_length": "maxLength",
    }.items():
        if source_key in validation:
            result[schema_key] = validation[source_key]
    if field.get("components"):
        bounds = {
            key: result.pop(key)
            for key in ("minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum")
            if key in result
        }
        result["properties"] = {
            component["key"]: {"type": "number", **bounds} for component in field["components"]
        }
        result["required"] = [component["key"] for component in field["components"]]
    if field["value_type"] == "text":
        result["pattern"] = r"\S"
    if field["value_type"] == "select":
        result["enum"] = [option["value"] for option in field.get("options", [])]
    return result


def _field_dictionary_row(
    doc: dict[str, Any],
    source_part: str,
    field: dict[str, Any],
) -> dict[str, Any]:
    requirement = field["requirement"]
    module_key = module_key_for_field(field, doc)
    condition = requirement.get("condition")
    if condition is not None:
        condition_field_key = next(
            (
                item["key"]
                for item in [*experiment_fields(doc), *entity_fields(doc)]
                if f"{item['module']}.{item['label']}" == condition.get("field")
            ),
            None,
        )
        condition = {
            **condition,
            "value": canonical_option_value(
                condition.get("value"), doc, field_key=condition_field_key
            ),
        }
    return {
        "source_part": source_part,
        "module": field["module"],
        "module_key": module_key,
        "key": field["key"],
        "label": field["label"],
        "label_en": field["label_en"],
        "meaning": field.get("meaning"),
        "input": field.get("input"),
        "example": field.get("example"),
        "help": field.get("help"),
        "help_en": field.get("help_en"),
        "machine_type": _field_machine_type(source_part, module_key, field["key"]),
        "schema_path": _field_schema_path(source_part, module_key, field["key"]),
        "r0": bool(field.get("r0")),
        "condition": condition,
        "requirement": requirement["level"],
        "otherwise": requirement.get("otherwise"),
        "validation": field.get("validation"),
        "unit": None if field.get("unit") == "—" else field.get("unit"),
        "options": None if field.get("options") == "—" else field.get("options"),
    }


def _field_schema_path(source_part: str, module_key: str, key: str) -> str | None:
    schema, nodes, relative_path = _field_schema_nodes(source_part, module_key, key)
    if schema is None or not nodes or relative_path is None:
        return None
    prefix = "entities" if source_part == "entity" else "modules"
    return f"$.{prefix}.{module_key}.{relative_path}"


def _field_machine_type(source_part: str, module_key: str, key: str) -> str:
    schema, nodes, _ = _field_schema_nodes(source_part, module_key, key)
    if schema is None:
        return "file" if key == "raw_data" else "unknown"
    types = {
        item_type
        for node in nodes
        for item_type in _schema_types(node, schema)
        if item_type != "null"
    }
    return " | ".join(sorted(types)) or ("file" if key == "raw_data" else "unknown")


def _field_model(source_part: str, module_key: str) -> type[Any] | None:
    return (
        V2_ENTITY_PAYLOAD_MODELS.get(module_key)
        if source_part == "entity"
        else RELEASED_MODULE_PAYLOAD_MODELS.get(module_key)
    )


def _field_schema_nodes(
    source_part: str, module_key: str, key: str
) -> tuple[dict[str, Any] | None, list[dict[str, Any]], str | None]:
    model = _field_model(source_part, module_key)
    if model is None:
        return None, [], None
    schema = model.model_json_schema()
    direct = schema.get("properties", {}).get(key)
    if isinstance(direct, dict):
        return schema, [direct], f"properties.{key}"
    items = schema.get("properties", {}).get("items", {}).get("items", {})
    item_nodes = [
        node
        for variant in _schema_variants(items, schema)
        if isinstance(node := variant.get("properties", {}).get(key), dict)
    ]
    if item_nodes:
        return schema, item_nodes, f"properties.items.items.properties.{key}"
    matches = _schema_property_matches(schema, schema, key)
    paths = {path for path, _ in matches}
    if paths:
        nearest_depth = min(path.count(".") for path in paths)
        paths = {path for path in paths if path.count(".") == nearest_depth}
    if len(paths) != 1:
        return schema, [], None
    path = paths.pop()
    return schema, [node for node_path, node in matches if node_path == path], path


def _schema_property_matches(
    node: dict[str, Any],
    root: dict[str, Any],
    key: str,
    path: str = "",
    followed_refs: frozenset[str] = frozenset(),
) -> list[tuple[str, dict[str, Any]]]:
    ref = node.get("$ref")
    if isinstance(ref, str) and ref.startswith("#/"):
        if ref in followed_refs:
            return []
        return _schema_property_matches(
            _resolve_schema_ref(node, root),
            root,
            key,
            path,
            followed_refs | {ref},
        )
    matches: list[tuple[str, dict[str, Any]]] = []
    for variant in [
        *(node.get("oneOf") or []),
        *(node.get("anyOf") or []),
        *(node.get("allOf") or []),
    ]:
        matches.extend(_schema_property_matches(variant, root, key, path, followed_refs))
    for name, child in node.get("properties", {}).items():
        child_path = f"{path}.properties.{name}".lstrip(".")
        if name == key:
            matches.append((child_path, child))
        matches.extend(_schema_property_matches(child, root, key, child_path, followed_refs))
    items = node.get("items")
    if isinstance(items, dict):
        matches.extend(
            _schema_property_matches(
                items,
                root,
                key,
                f"{path}.items".lstrip("."),
                followed_refs,
            )
        )
    return matches


def _schema_variants(node: dict[str, Any], root: dict[str, Any]) -> list[dict[str, Any]]:
    node = _resolve_schema_ref(node, root)
    variants = node.get("oneOf") or node.get("anyOf")
    if variants:
        return [resolved for variant in variants for resolved in _schema_variants(variant, root)]
    return [node]


def _schema_types(node: dict[str, Any], root: dict[str, Any]) -> set[str]:
    node = _resolve_schema_ref(node, root)
    result: set[str] = set()
    raw_type = node.get("type")
    if isinstance(raw_type, str):
        result.add(raw_type)
    elif isinstance(raw_type, list):
        result.update(item for item in raw_type if isinstance(item, str))
    for variant in [*(node.get("oneOf") or []), *(node.get("anyOf") or [])]:
        result.update(_schema_types(variant, root))
    return result


def _resolve_schema_ref(node: dict[str, Any], root: dict[str, Any]) -> dict[str, Any]:
    ref = node.get("$ref")
    if not isinstance(ref, str) or not ref.startswith("#/"):
        return node
    resolved: Any = root
    for token in ref[2:].split("/"):
        resolved = resolved[token.replace("~1", "/").replace("~0", "~")]
    return resolved if isinstance(resolved, dict) else node


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    paths = export_v2_schema(field_source=args.field_source, output_dir=args.output_dir)
    print(paths["json_schema"])
    print(paths["field_dictionary_json"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
