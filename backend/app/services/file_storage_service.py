from __future__ import annotations

import hashlib
import re
from pathlib import Path
from uuid import UUID

from app.core.config import get_settings


class FileStorageService:
    MAX_FILENAME_BYTES = 255
    FILE_ID_PREFIX_BYTES = 37

    def __init__(self) -> None:
        settings = get_settings()
        self.root = Path(settings.file_storage_root).expanduser().resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def persist(
        self,
        *,
        experiment_run_code: str,
        file_id: UUID,
        original_name: str,
        content: bytes,
    ) -> tuple[str, str]:
        safe_run_code = self._sanitize_path_segment(experiment_run_code)
        safe_name = self._sanitize_filename(original_name)
        relative_path = Path(safe_run_code) / f"{file_id}_{safe_name}"
        absolute_path = self.resolve(str(relative_path))
        absolute_path.parent.mkdir(parents=True, exist_ok=True)
        absolute_path.write_bytes(content)
        return str(relative_path), hashlib.sha256(content).hexdigest()

    def resolve(self, storage_path: str) -> Path:
        candidate = Path(storage_path)
        if candidate.is_absolute():
            raise ValueError("Resolved path is outside storage root")

        resolved = (self.root / candidate).resolve()
        if not resolved.is_relative_to(self.root):
            raise ValueError("Resolved path is outside storage root")
        return resolved

    def delete(self, storage_path: str) -> None:
        absolute_path = self.resolve(storage_path)
        if absolute_path.exists():
            absolute_path.unlink()

    def _sanitize_filename(self, original_name: str) -> str:
        name = Path(original_name).name or "upload.bin"
        candidate_suffix = Path(name).suffix
        suffix = candidate_suffix if re.fullmatch(r"\.[A-Za-z0-9]{1,32}", candidate_suffix) else ""
        stem_source = name[: -len(candidate_suffix)] if suffix else name
        sanitized_stem = re.sub(r"[^A-Za-z0-9._-]+", "_", stem_source).strip("._")
        sanitized_stem = sanitized_stem or "upload"
        limit = self.MAX_FILENAME_BYTES - self.FILE_ID_PREFIX_BYTES
        stem_limit = limit - len(suffix.encode("ascii"))
        stem = sanitized_stem[:stem_limit].rstrip("._") or "upload"
        return f"{stem}{suffix}"

    @staticmethod
    def normalize_original_name(original_name: str, max_chars: int = 255) -> str:
        name = Path(original_name).name or "upload.bin"
        if len(name) <= max_chars:
            return name
        suffix = Path(name).suffix
        if len(suffix) > 32:
            suffix = ""
        stem = name[: max_chars - len(suffix)].rstrip(".") or "upload"
        return f"{stem}{suffix}"

    def _sanitize_path_segment(self, segment: str) -> str:
        sanitized = re.sub(r"[^A-Za-z0-9._-]+", "_", segment).strip("._")
        return sanitized or "uploads"
