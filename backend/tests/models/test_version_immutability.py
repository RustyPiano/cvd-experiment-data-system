import pytest
from sqlalchemy import delete, update
from sqlalchemy.exc import DBAPIError

from app.models.v2_entities import (
    Instrument,
    InstrumentVersion,
    MaterialLot,
    MaterialLotVersion,
    Setup,
    SetupVersion,
)


@pytest.mark.parametrize(
    ("entity_model", "version_model", "values"),
    [
        (
            MaterialLot,
            MaterialLotVersion,
            {
                "lot_category": "chemical",
                "substance_name": "MoO3",
                "chemical_formula": "MoO3",
                "batch_number": "B1",
            },
        ),
        (
            Setup,
            SetupVersion,
            {
                "setup_code": "S1",
                "setup_name": "Setup",
                "zone_count": 1,
                "orientation": "horizontal",
                "coordinate_system": "upstream negative",
            },
        ),
        (
            Instrument,
            InstrumentVersion,
            {"instrument_code": "I1", "name_type": "Raman"},
        ),
    ],
)
def test_database_rejects_bulk_version_updates(
    db_session,
    entity_model,
    version_model,
    values,
) -> None:
    entity = entity_model()
    db_session.add(entity)
    db_session.flush()
    version = version_model(entity_id=entity.id, version=1, attrs={}, **values)
    db_session.add(version)
    db_session.commit()

    with pytest.raises(DBAPIError):
        db_session.execute(
            update(version_model).where(version_model.id == version.id).values(version=2)
        )
        db_session.commit()
    db_session.rollback()


@pytest.mark.parametrize(
    ("entity_model", "version_model", "values"),
    [
        (
            MaterialLot,
            MaterialLotVersion,
            {
                "lot_category": "chemical",
                "substance_name": "MoO3",
                "chemical_formula": "MoO3",
                "batch_number": "B1",
            },
        ),
        (
            Setup,
            SetupVersion,
            {
                "setup_code": "S1",
                "setup_name": "Setup",
                "zone_count": 1,
                "orientation": "horizontal",
                "coordinate_system": "upstream negative",
            },
        ),
        (
            Instrument,
            InstrumentVersion,
            {"instrument_code": "I1", "name_type": "Raman"},
        ),
    ],
)
def test_database_rejects_bulk_version_deletes(
    db_session,
    entity_model,
    version_model,
    values,
) -> None:
    entity = entity_model()
    db_session.add(entity)
    db_session.flush()
    version = version_model(entity_id=entity.id, version=1, attrs={}, **values)
    db_session.add(version)
    db_session.commit()

    with pytest.raises(DBAPIError):
        db_session.execute(delete(version_model).where(version_model.id == version.id))
        db_session.commit()
    db_session.rollback()
