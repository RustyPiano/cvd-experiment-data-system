import pytest
from fastapi import HTTPException

from app.schemas.generated.v2_module_payload import MaterialLotVersionPayload
from app.services.v2_entity_service import V2EntityService


def test_mica_type_is_required_and_controls_the_formula(db_session, admin_user) -> None:
    base = {
        "lot_category": "substrate",
        "substance_name": "云母",
        "batch_number_availability": "batch_number_reported",
        "batch_number": "MICA-1",
        "substrate_material": "mica",
    }
    with pytest.raises(ValueError, match="mica_type"):
        MaterialLotVersionPayload.model_validate({**base, "chemical_formula": "KMg3(AlSi3O10)F2"})

    payload = MaterialLotVersionPayload.model_validate(
        {
            **base,
            "mica_type": "fluorophlogopite",
            "chemical_formula": "KAl2(AlSi3O10)(OH)2",
        }
    )
    with pytest.raises(HTTPException) as exc:
        V2EntityService(db_session).create_entity("material_lot", payload, admin_user)
    assert exc.value.detail == {"invalid": [{"key": "chemical_formula", "reason": "identity"}]}

    payload = payload.model_copy(update={"chemical_formula": "KMg3(AlSi3O10)F2"})
    created = V2EntityService(db_session).create_entity("material_lot", payload, admin_user)
    assert created.latest_version.data["mica_type"] == "fluorophlogopite"
