import pytest
from fastapi import HTTPException

from app.schemas.generated.v2_module_payload import MaterialLotVersionPayload
from app.schemas.v2 import V2EntityVersionPayload
from app.services.substrate_orientation import normalize_crystal_plane
from app.services.v2_entity_service import V2EntityService
from app.services.v2_entity_snapshot_service import material_lot_item_projection


@pytest.mark.parametrize(
    ("raw", "material", "expected"),
    [
        ("(100)", "sio2_si", "(1 0 0)"),
        ("c 面", "sapphire_al2o3", "(0 0 0 1)"),
        ("(11-20)", "sapphire_al2o3", "(1 1 -2 0)"),
        ("（1 0 −1 2）", "sapphire_al2o3", "(1 0 -1 2)"),
        ("(0 0 1)", "mica", "(0 0 1)"),
        ("(0001)", "h-BN", "(0 0 0 1)"),
        ("(12 -1 0)", "cu_foil", "(12 -1 0)"),
        ("polycrystalline", "au_foil", "polycrystalline"),
    ],
)
def test_plane_format(raw, material, expected):
    assert normalize_crystal_plane(raw, material) == expected


@pytest.mark.parametrize(
    ("raw", "material"),
    [
        ("[100]", "sio2_si"),
        ("{100}", "sio2_si"),
        ("(000)", "sio2_si"),
        ("(1111)", "sapphire_al2o3"),
        ("(100)", "sapphire_al2o3"),
        ("(0001)", "mica"),
        ("c面偏2度", "sapphire_al2o3"),
        ("(1.5 0 0)", "cu_foil"),
        ("(1 0 0)", "quartz"),
        ("amorphous", "sapphire_al2o3"),
    ],
)
def test_invalid_planes_are_not_silently_reinterpreted(raw, material):
    with pytest.raises(ValueError, match="substrate_crystal_plane"):
        normalize_crystal_plane(raw, material)


def test_independent_specs_quartz_and_frozen_projection(db_session, admin_user):
    base = {
        "lot_category": "substrate",
        "substance_name": "蓝宝石",
        "chemical_formula": "Al2O3",
        "batch_number": "ORIENTATION-1",
        "batch_number_availability": "batch_number_reported",
        "substrate_material": "sapphire_al2o3",
    }
    service = V2EntityService(db_session)
    for spec in (
        {"substrate_crystal_plane": "c-plane"},
        {"substrate_polish": "double_side_polished"},
    ):
        payload = MaterialLotVersionPayload.model_validate({**base, **spec})
        saved = service.create_entity("material_lot", payload, admin_user).latest_version.data
        projection = material_lot_item_projection("substrates", {"attrs": saved})
        if "substrate_crystal_plane" in spec:
            assert projection["crystal_orientation"] == "(0 0 0 1)"
            assert "polish" not in projection
        else:
            assert projection["polish"] == "double_side_polished"
            assert "crystal_orientation" not in projection

    quartz = {**base, "substrate_material": "quartz", "chemical_formula": "SiO2"}
    fused = MaterialLotVersionPayload.model_validate(
        {**quartz, "quartz_type": "fused_silica", "substrate_polish": "single_side_polished"}
    )
    assert fused.substrate_crystal_plane == "amorphous"
    for invalid in (
        {"quartz_type": "fused_silica", "substrate_crystal_plane": "(100)"},
        {"quartz_type": "single_crystal_quartz", "substrate_crystal_plane": "amorphous"},
        {"substrate_crystal_plane": "supplier_cut", "substrate_cut_spec": "AT-cut"},
    ):
        with pytest.raises(ValueError, match="substrate_crystal_plane"):
            MaterialLotVersionPayload.model_validate({**quartz, **invalid})
    cut = MaterialLotVersionPayload.model_validate(
        {
            **quartz,
            "quartz_type": "single_crystal_quartz",
            "substrate_crystal_plane": "supplier_cut",
            "substrate_cut_spec": " AT-cut ",
        }
    )
    assert (
        material_lot_item_projection("substrates", cut.model_dump())["crystal_orientation"]
        == "AT-cut"
    )
    legacy = {
        "substrate_orientation_polish": {"value": "c面 原始规格", "option": "single_side_polished"}
    }
    assert (
        material_lot_item_projection("substrates", legacy)["crystal_orientation"]
        == "c面 原始规格；single_side_polished"
    )
    # The service also validates callers that do not use the generated request model.
    with pytest.raises(HTTPException) as error:
        service.create_entity(
            "material_lot",
            V2EntityVersionPayload(**base, substrate_crystal_plane="[0001]"),
            admin_user,
        )
    assert error.value.detail == {
        "invalid": [{"key": "substrate_crystal_plane", "reason": "value"}]
    }
