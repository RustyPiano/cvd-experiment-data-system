"""Supplier crystal-plane specifications; never reinterpret direction indices."""

import re

from app.services.v2_field_source import load_field_source


def normalize_crystal_plane(value: str, material: str = "", quartz_type: str = "") -> str:
    rules = load_field_source()["substrate_orientation"]
    if not isinstance(value, str) or len(value) > rules["max_length"]:
        raise ValueError("substrate_crystal_plane: invalid text")
    value = value.strip().replace("−", "-").replace("（", "(").replace("）", ")")
    if not value:
        return ""
    if material == "quartz" and quartz_type == "fused_silica" and value != "amorphous":
        raise ValueError("substrate_crystal_plane: fused silica is amorphous")
    if value in rules["statuses"]:
        if material == "sapphire_al2o3" and value in {"amorphous", "polycrystalline"}:
            raise ValueError("substrate_crystal_plane: sapphire is single crystalline")
        if (
            material == "quartz"
            and quartz_type == "single_crystal_quartz"
            and value in {"amorphous", "polycrystalline"}
        ):
            raise ValueError("substrate_crystal_plane: quartz type contradicts orientation state")
        return value
    if material == "quartz" and quartz_type != "single_crystal_quartz":
        raise ValueError("substrate_crystal_plane: specify single-crystal quartz first")
    if material == "sapphire_al2o3":
        name = re.sub(r"[\s-]", "", value.lower())
        for plane, letter in rules["sapphire_plane_names"].items():
            if any(name == f"{letter}{suffix}" for suffix in rules["sapphire_name_suffixes"]):
                return plane
    if value.startswith("(") and value.endswith(")"):
        value = value[1:-1].strip()
    if re.fullmatch(r"[+-]?\d+(?:\s+[+-]?\d+){2,3}", value):
        indices = [int(part) for part in value.split()]
    elif re.fullmatch(r"(?:-?\d){3,4}", value):
        indices = [int(part) for part in re.findall(r"-?\d", value)]
    else:
        raise ValueError("substrate_crystal_plane: use three or four integer plane indices")
    if len(indices) not in rules["index_counts"].get(material, [3, 4]):
        raise ValueError("substrate_crystal_plane: index count does not match substrate")
    if (
        not all(abs(index) <= 2**53 - 1 for index in indices)
        or not any(indices)
        or (len(indices) == 4 and sum(indices[:3]) != 0)
    ):
        raise ValueError("substrate_crystal_plane: invalid zero plane or h+k+i is not zero")
    return "(" + " ".join(map(str, indices)) + ")"


def normalize_substrate_orientation(data: dict) -> dict:
    """Normalize new fields only; retain old combined records verbatim."""
    material = data.get("substrate_material") or ""
    quartz_type = data.get("quartz_type") or ""
    raw = data.get("substrate_crystal_plane")
    plane = normalize_crystal_plane(raw if raw is not None else "", material, quartz_type)
    if material == "quartz" and quartz_type == "fused_silica":
        plane = "amorphous"
    cut = data.get("substrate_cut_spec")
    if cut is not None and (
        not isinstance(cut, str)
        or not cut.strip()
        or len(cut) > load_field_source()["substrate_orientation"]["max_length"]
    ):
        raise ValueError("substrate_cut_spec: invalid supplier specification")
    if (plane == "supplier_cut") != bool(cut):
        raise ValueError("substrate_cut_spec: required only for a supplier cut")
    if plane == "supplier_cut" and material == "quartz" and quartz_type != "single_crystal_quartz":
        raise ValueError("substrate_crystal_plane: specify single-crystal quartz first")
    return {
        "substrate_crystal_plane": plane or None,
        "substrate_cut_spec": cut.strip() if cut else None,
    }
