from __future__ import annotations

from sqlalchemy import func, select

from app.commands.seed_from_field_source import main, seed_from_field_source
from app.models.field_definition import FieldDefinition
from app.models.vocabulary import ControlledVocabulary


def _v2_fields(db_session) -> list[FieldDefinition]:
    return [
        row
        for row in db_session.scalars(select(FieldDefinition)).all()
        if row.metadata_json.get("schema_version") == "cvd_v2"
    ]


def _v2_vocab_rows(db_session) -> list[ControlledVocabulary]:
    return list(
        db_session.scalars(
            select(ControlledVocabulary).where(ControlledVocabulary.vocab_key.like("cvd_v2.%"))
        ).all()
    )


def _seeded_snapshot(db_session) -> tuple[list[tuple], list[tuple]]:
    fields = sorted(
        (
            row.module_key,
            row.field_key,
            row.label_zh,
            row.label_en,
            row.field_type,
            row.unit,
            row.required,
            row.vocab_key,
            row.sort_order,
            row.metadata_json,
        )
        for row in _v2_fields(db_session)
    )
    vocab = sorted(
        (
            row.vocab_key,
            row.value,
            row.label_zh,
            row.label_en,
            row.sort_order,
            row.metadata_json,
        )
        for row in _v2_vocab_rows(db_session)
    )
    return fields, vocab


def test_seed_from_field_source_writes_only_cvd_v2_rows_and_is_idempotent(db_session) -> None:
    v1_field_count = db_session.scalar(select(func.count()).select_from(FieldDefinition))
    v1_vocab_count = db_session.scalar(select(func.count()).select_from(ControlledVocabulary))

    first = seed_from_field_source(db_session)
    db_session.commit()
    first_snapshot = _seeded_snapshot(db_session)

    second = seed_from_field_source(db_session)
    db_session.commit()
    second_snapshot = _seeded_snapshot(db_session)

    assert first.fields_created == 123
    assert second.fields_created == 0
    assert len(_v2_fields(db_session)) == 123
    assert db_session.scalar(select(func.count()).select_from(FieldDefinition)) == (
        v1_field_count + 123
    )
    assert (
        db_session.scalar(select(func.count()).select_from(ControlledVocabulary)) >= v1_vocab_count
    )
    assert first_snapshot == second_snapshot


def test_seed_from_field_source_sets_v2_metadata_required_flag_and_vocab(db_session) -> None:
    seed_from_field_source(db_session)
    db_session.commit()

    setup_ref = db_session.scalar(
        select(FieldDefinition).where(
            FieldDefinition.module_key == "equipment",
            FieldDefinition.field_key == "setup_ref",
            FieldDefinition.vocab_key.is_(None),
        )
    )
    synthesis_vocab = db_session.scalars(
        select(ControlledVocabulary)
        .where(ControlledVocabulary.vocab_key == "cvd_v2.basic_info.synthesis_method")
        .order_by(ControlledVocabulary.sort_order)
    ).all()

    assert setup_ref is not None
    assert setup_ref.required is True
    assert setup_ref.metadata_json["schema_version"] == "cvd_v2"
    assert setup_ref.metadata_json["source"] == "field-source.yaml"
    assert [row.value for row in synthesis_vocab][:3] == ["CVD", "APCVD", "LPCVD"]
    assert all(row.metadata_json["schema_version"] == "cvd_v2" for row in synthesis_vocab)


def test_seed_from_field_source_command_runs(db_session, capsys) -> None:
    assert main([]) == 0
    captured = capsys.readouterr()
    assert "cvd_v2 field definitions" in captured.out
