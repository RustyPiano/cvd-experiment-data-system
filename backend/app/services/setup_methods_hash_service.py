from __future__ import annotations

import hashlib
import json
from typing import Any

HASH_FIELDS = (
    "setup_name_snapshot",
    "setup_version_snapshot",
    "institution_snapshot",
    "apparatus_description_snapshot",
    "methods_text_snapshot",
    "sample_placement_description_snapshot",
    "reaction_flow_description_snapshot",
    "reference_paper_url_snapshot",
    "unpublished_reason_snapshot",
    "diagram_sha256",
    "is_same_as_template",
    "deviation_note",
    "semantic_context",
)


class SetupMethodsHashService:
    def calculate_hash(self, payload: dict[str, Any]) -> str:
        metadata = payload.get("metadata_json")
        semantic_context = metadata.get("semantic_context") if isinstance(metadata, dict) else None
        canonical = {
            field: payload.get(field)
            for field in HASH_FIELDS
            if field != "semantic_context" and payload.get(field) is not None
        }
        if semantic_context is not None:
            canonical["semantic_context"] = semantic_context
        serialized = json.dumps(
            canonical,
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=False,
        )
        return hashlib.sha256(serialized.encode("utf-8")).hexdigest()

    def manual_key(self, snapshot_hash: str) -> str:
        return f"manual:{snapshot_hash[:16]}"
