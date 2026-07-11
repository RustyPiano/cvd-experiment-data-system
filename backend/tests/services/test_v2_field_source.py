from types import SimpleNamespace

from app.services import v2_field_source


def test_load_field_source_bypasses_cache_in_development(tmp_path, monkeypatch) -> None:
    source = tmp_path / "fields.yaml"
    source.write_text("version: 1\n", encoding="utf-8")
    monkeypatch.setattr(
        v2_field_source,
        "get_settings",
        lambda: SimpleNamespace(app_env="development", app_debug=False),
        raising=False,
    )

    assert v2_field_source.load_field_source(str(source))["version"] == 1
    source.write_text("version: 2\n", encoding="utf-8")
    assert v2_field_source.load_field_source(str(source))["version"] == 2
