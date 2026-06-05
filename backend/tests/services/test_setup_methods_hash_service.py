from app.services.setup_methods_hash_service import SetupMethodsHashService


def base_payload() -> dict:
    return {
        "setup_name_snapshot": "Manual setup",
        "setup_version_snapshot": 1,
        "institution_snapshot": "group",
        "apparatus_description_snapshot": "Tube furnace",
        "methods_text_snapshot": "Methods text",
        "sample_placement_description_snapshot": "Downstream placement",
        "reaction_flow_description_snapshot": "Ramp hold cool",
        "reference_paper_url_snapshot": None,
        "unpublished_reason_snapshot": "Internal",
        "diagram_sha256": "d" * 64,
        "is_same_as_template": False,
        "deviation_note": None,
        "metadata_json": {
            "semantic_context": {"pressure": "ambient"},
            "ui": {"expanded": True},
        },
    }


def test_hash_ignores_non_semantic_metadata() -> None:
    service = SetupMethodsHashService()
    first = base_payload()
    second = base_payload()
    second["metadata_json"]["ui"] = {"expanded": False}

    assert service.calculate_hash(first) == service.calculate_hash(second)


def test_hash_changes_when_semantic_context_changes() -> None:
    service = SetupMethodsHashService()
    first = base_payload()
    second = base_payload()
    second["metadata_json"]["semantic_context"] = {"pressure": "low"}

    assert service.calculate_hash(first) != service.calculate_hash(second)


def test_manual_setup_key_uses_hash_prefix() -> None:
    service = SetupMethodsHashService()
    snapshot_hash = "abcdef1234567890ffff"

    assert service.manual_key(snapshot_hash) == "manual:abcdef1234567890"
