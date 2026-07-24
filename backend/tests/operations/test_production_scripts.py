from __future__ import annotations

import hashlib
import os
import shutil
import stat
import subprocess
import tarfile
import time
from pathlib import Path

import pytest
import yaml

REPO_ROOT = Path(__file__).resolve().parents[3]
DATABASE_TARGET_ENV = (
    "COMPOSE_DATABASE_URL="
    "postgresql+psycopg://fixture-user:fixture-password@fixture-postgres:5432/fixture-db\n"
    "PG_CONTAINER=fixture-postgres\n"
    "POSTGRES_USER=fixture-user\n"
    "POSTGRES_DB=fixture-db\n"
)


def _executable(path: Path, content: str) -> None:
    path.write_text(content, encoding="utf-8")
    path.chmod(path.stat().st_mode | stat.S_IXUSR)


def _deploy_fixture(
    tmp_path: Path,
    *,
    schema_state: str,
    public_object_kind: str = "",
    compose_status: str = "backend|running|healthy\nfrontend|running|healthy",
    revision: str = "20260711_0001",
    schema_fingerprint: str = "ok",
    file_asset_shape: str = "current",
    expected_services: str = "backend\nfrontend",
) -> Path:
    project = tmp_path / "project"
    project.mkdir()
    shutil.copy2(REPO_ROOT / "deploy.sh", project / "deploy.sh")
    (project / ".env").write_text(
        f"APP_NAME=CVD Backend\n{DATABASE_TARGET_ENV}",
        encoding="utf-8",
    )
    _executable(project / "backup.sh", "#!/usr/bin/env bash\nexit 0\n")
    (project / "docker-compose.prod.yml").write_text("services: {}\n", encoding="utf-8")
    (project / "volume-data").mkdir()
    migration_dir = project / "backend" / "alembic" / "versions"
    migration_dir.mkdir(parents=True)
    (migration_dir / "initial.py").write_text("revision = '20260711_0001'\n", encoding="utf-8")
    fake_bin = project / "bin"
    fake_bin.mkdir()
    _executable(
        fake_bin / "git",
        """#!/usr/bin/env bash
if [ "$1" = "rev-parse" ] && [ "$2" = "HEAD" ]; then
    printf '%s\n' "${BATCH8_FAKE_HEAD:-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa}"
    exit 0
fi
if [ "$1" = "status" ] && [ "$2" = "--porcelain" ]; then
    printf '%s' "${BATCH8_FAKE_DIRTY:-}"
    exit 0
fi
if [ "$1" = "pull" ]; then
    touch git-pull-called
fi
exit 0
""",
    )
    _executable(
        fake_bin / "docker",
        f"""#!/usr/bin/env bash
if [ "$1" = "exec" ]; then
    if [ "$2" != "fixture-postgres" ] || [[ " $* " != *" -U fixture-user "* ]] \
        || [[ " $* " != *" -d fixture-db "* ]]; then
        exit 3
    fi
    query="${{!#}}"
    case "$query" in
        *schema_state*)
            state='{schema_state}'
            case '{public_object_kind}' in
                view) [[ "$query" == *"'v'"* ]] && state='nonempty-no-alembic' ;;
                materialized-view) [[ "$query" == *"'m'"* ]] && state='nonempty-no-alembic' ;;
                sequence) [[ "$query" == *"'S'"* ]] && state='nonempty-no-alembic' ;;
                foreign-table) [[ "$query" == *"'f'"* ]] && state='nonempty-no-alembic' ;;
                function|procedure)
                    [[ "$query" == *"pg_proc"* ]] && state='nonempty-no-alembic'
                    ;;
                enum|domain)
                    [[ "$query" == *"pg_type"* ]] && state='nonempty-no-alembic'
                    ;;
            esac
            printf '%s\\n' "$state"
            ;;
        *version_num*) printf '%s\\n' '{revision}' ;;
        *schema_fingerprint*)
            fingerprint='{schema_fingerprint}'
            case '{file_asset_shape}' in
                missing-entity-columns)
                    if [[ "$query" == *"file_assets"* \
                        && "$query" == *"entity_type"* \
                        && "$query" == *"entity_id"* \
                        && "$query" == *"entity_version"* ]]; then
                        fingerprint='mismatch'
                    fi
                    ;;
                run-scope-not-nullable)
                    if [[ "$query" == *"experiment_run_id"* \
                        && "$query" == *"attnotnull"* ]]; then
                        fingerprint='mismatch'
                    fi
                    ;;
                missing-scope-check)
                    if [[ "$query" == *"ck_file_assets_single_scope"* ]]; then
                        fingerprint='mismatch'
                    fi
                    ;;
                missing-type-check)
                    if [[ "$query" == *"ck_file_assets_entity_type"* ]]; then
                        fingerprint='mismatch'
                    fi
                    ;;
            esac
            printf '%s\\n' "$fingerprint"
            ;;
        *) exit 2 ;;
    esac
    exit 0
fi
if [ "$1" = "volume" ] && [ "$2" = "inspect" ]; then
    [ "${{BATCH8_FAIL_VOLUME_INSPECT:-0}}" != "1" ] || exit 99
    if [ "$3" = "--format" ]; then
        [ "$5" = "${{COMPOSE_PROJECT_NAME:-project}}_storage_data" ] || exit 1
        printf '%s\n' "$PWD/volume-data"
        exit 0
    fi
    [ "$3" = "${{COMPOSE_PROJECT_NAME:-project}}_storage_data" ]
    exit
fi
if [ "$1" = "cp" ]; then
    [ "$2" = "backend-container:/data/storage/." ] && [ "$3" = "-" ] || exit 1
    /usr/bin/tar -cf - -C "$PWD/volume-data" .
    exit 0
fi
if [ "$1" = "inspect" ] && [ "$2" = "--format" ]; then
    printf '%s|%s\n' \
        "${{BATCH8_FAKE_RUNNING:-false}}" \
        "${{COMPOSE_PROJECT_NAME:-project}}_storage_data"
    exit 0
fi
if [[ " $* " == *" ps -q --all backend "* ]]; then
    printf '%s\n' 'backend-container'
    exit 0
fi
if [[ " $* " == *" config --services "* ]]; then
    printf '%s\\n' '{expected_services}'
    exit 0
fi
if [[ " $* " == *" ps --all --format "* ]]; then
    printf '%s\\n' '{compose_status}'
    exit 0
fi
if [[ " $* " == *" up -d --build "* ]]; then
    touch compose-up-called
    exit 0
fi
exit 0
""",
    )
    return project


def _run_script(project: Path, name: str, **environment: str) -> subprocess.CompletedProcess[str]:
    env = os.environ.copy()
    for key in (
        "BATCH8_FAKE_DIRTY",
        "BATCH8_FAKE_HEAD",
        "BATCH8_FAKE_RUNNING",
        "BATCH8_FAIL_VOLUME_INSPECT",
        "BATCH8_PROOF_MAX_AGE_SECONDS",
        "BATCH8_VERIFIED_BACKUP_DIR",
        "COMPOSE_DATABASE_URL",
        "PG_CONTAINER",
        "POSTGRES_DB",
        "POSTGRES_USER",
        "SKIP_SCHEMA_GUARD",
    ):
        env.pop(key, None)
    env.update(environment)
    env["PATH"] = f"{project / 'bin'}:{env['PATH']}"
    return subprocess.run(
        ["bash", name],
        cwd=project,
        env=env,
        capture_output=True,
        text=True,
        timeout=10,
        check=False,
    )


def _batch8_backup_dir(
    project: Path,
    *,
    backup_root: Path | None = None,
) -> tuple[Path, str]:
    target_sha = "a" * 40
    backup_root = backup_root or project / "backups"
    backup_root.mkdir()
    backup_root.chmod(0o700)
    (backup_root / ".cvd-backup-root").touch()
    backup_dir = backup_root / "20260724_120000"
    backup_dir.mkdir()
    backup_dir.chmod(0o700)
    database = backup_dir / "database.sql"
    storage = backup_dir / "storage.tar.gz"
    database.write_text("-- verified PostgreSQL dump\n", encoding="utf-8")
    with tarfile.open(storage, "w:gz") as archive:
        payload = project / "stored-file.txt"
        payload.write_text("evidence\n", encoding="utf-8")
        archive.add(payload, arcname="stored-file.txt")
    hashes = {
        path.name: hashlib.sha256(path.read_bytes()).hexdigest() for path in (database, storage)
    }
    (backup_dir / "SHA256SUMS").write_text(
        f"{hashes['database.sql']}  database.sql\n{hashes['storage.tar.gz']}  storage.tar.gz\n",
        encoding="utf-8",
    )
    (backup_dir / "batch8-proof.env").write_text(
        "FORMAT=cvd-batch8-v1\n"
        "PG_CONTAINER=fixture-postgres\n"
        "POSTGRES_USER=fixture-user\n"
        "POSTGRES_DB=fixture-db\n"
        "STORAGE_VOLUME=project_storage_data\n"
        f"TARGET_GIT_SHA={target_sha}\n"
        f"DATABASE_SHA256={hashes['database.sql']}\n"
        f"STORAGE_SHA256={hashes['storage.tar.gz']}\n"
        f"VERIFIED_AT_EPOCH={int(time.time())}\n"
        "RESTORE_VERIFIED=true\n",
        encoding="utf-8",
    )
    for name in ("database.sql", "storage.tar.gz", "SHA256SUMS", "batch8-proof.env"):
        (backup_dir / name).chmod(0o600)
    return backup_dir, target_sha


def _run_batch8_deploy(
    project: Path,
    backup_dir: Path,
    target_sha: str,
    **environment: str,
) -> subprocess.CompletedProcess[str]:
    return _run_script(
        project,
        "deploy.sh",
        BATCH8_FAKE_HEAD=target_sha,
        BATCH8_VERIFIED_BACKUP_DIR=str(backup_dir),
        HEALTH_POLL_INTERVAL="1",
        MAX_WAIT="1",
        **environment,
    )


def test_batch8_deploy_uses_verified_backup_without_live_backup_or_pull(tmp_path) -> None:
    project = _deploy_fixture(tmp_path, schema_state="empty")
    backup_dir, target_sha = _batch8_backup_dir(project)
    _executable(
        project / "backup.sh",
        "#!/usr/bin/env bash\ntouch live-backup-called\nexit 99\n",
    )

    result = _run_batch8_deploy(project, backup_dir, target_sha)

    assert result.returncode == 0, result.stderr
    assert not (project / "live-backup-called").exists()
    assert not (project / "git-pull-called").exists()
    assert (project / "compose-up-called").exists()


@pytest.mark.parametrize(
    ("mutation", "error_fragment"),
    [
        ("empty-database", "database.sql"),
        ("bad-storage", "storage.tar.gz"),
        ("bad-hash", "SHA256"),
        ("rewritten-artifacts", "DATABASE_SHA256"),
        ("missing-field", "POSTGRES_DB"),
        ("wrong-database", "POSTGRES_DB"),
        ("wrong-volume", "STORAGE_VOLUME"),
        ("expired-proof", "过期"),
        ("restore-not-verified", "RESTORE_VERIFIED"),
        ("wrong-target", "TARGET_GIT_SHA"),
        ("wrong-permissions", "权限"),
    ],
)
def test_batch8_deploy_rejects_invalid_proof_before_compose_up(
    tmp_path,
    mutation: str,
    error_fragment: str,
) -> None:
    project = _deploy_fixture(tmp_path, schema_state="empty")
    backup_dir, target_sha = _batch8_backup_dir(project)
    if mutation == "empty-database":
        (backup_dir / "database.sql").write_bytes(b"")
    elif mutation == "bad-storage":
        (backup_dir / "storage.tar.gz").write_text("not a tar", encoding="utf-8")
    elif mutation == "bad-hash":
        (backup_dir / "SHA256SUMS").write_text(
            f"{'0' * 64}  database.sql\n{'0' * 64}  storage.tar.gz\n",
            encoding="utf-8",
        )
    elif mutation == "rewritten-artifacts":
        database = backup_dir / "database.sql"
        storage = backup_dir / "storage.tar.gz"
        database.write_text("-- replacement dump\n", encoding="utf-8")
        with tarfile.open(storage, "w:gz") as archive:
            replacement = project / "replacement.txt"
            replacement.write_text("replacement\n", encoding="utf-8")
            archive.add(replacement, arcname="replacement.txt")
        (backup_dir / "SHA256SUMS").write_text(
            f"{hashlib.sha256(database.read_bytes()).hexdigest()}  database.sql\n"
            f"{hashlib.sha256(storage.read_bytes()).hexdigest()}  storage.tar.gz\n",
            encoding="utf-8",
        )
    elif mutation == "missing-field":
        proof = backup_dir / "batch8-proof.env"
        proof.write_text(
            proof.read_text(encoding="utf-8").replace(
                "POSTGRES_DB=fixture-db\n",
                "",
            ),
            encoding="utf-8",
        )
    elif mutation == "wrong-database":
        proof = backup_dir / "batch8-proof.env"
        proof.write_text(
            proof.read_text(encoding="utf-8").replace(
                "POSTGRES_DB=fixture-db",
                "POSTGRES_DB=other-db",
            ),
            encoding="utf-8",
        )
    elif mutation == "wrong-volume":
        proof = backup_dir / "batch8-proof.env"
        proof.write_text(
            proof.read_text(encoding="utf-8").replace(
                "STORAGE_VOLUME=project_storage_data",
                "STORAGE_VOLUME=other_storage_data",
            ),
            encoding="utf-8",
        )
    elif mutation == "expired-proof":
        proof = backup_dir / "batch8-proof.env"
        lines = proof.read_text(encoding="utf-8").splitlines()
        proof.write_text(
            "\n".join(
                "VERIFIED_AT_EPOCH=1" if line.startswith("VERIFIED_AT_EPOCH=") else line
                for line in lines
            )
            + "\n",
            encoding="utf-8",
        )
    elif mutation == "restore-not-verified":
        proof = backup_dir / "batch8-proof.env"
        proof.write_text(
            proof.read_text(encoding="utf-8").replace(
                "RESTORE_VERIFIED=true",
                "RESTORE_VERIFIED=false",
            ),
            encoding="utf-8",
        )
    elif mutation == "wrong-target":
        target_sha = "b" * 40
    elif mutation == "wrong-permissions":
        (backup_dir / "database.sql").chmod(0o644)

    result = _run_batch8_deploy(project, backup_dir, target_sha)

    assert result.returncode == 1
    assert error_fragment in result.stderr
    assert not (project / "compose-up-called").exists()


def test_batch8_deploy_derives_the_marked_backup_root_from_the_capability(tmp_path) -> None:
    project = _deploy_fixture(tmp_path, schema_state="empty")
    backup_dir, target_sha = _batch8_backup_dir(project)
    external, external_sha = _batch8_backup_dir(
        project,
        backup_root=tmp_path / "external-backups",
    )

    relative = _run_batch8_deploy(
        project,
        Path("backups") / backup_dir.name,
        target_sha,
    )
    assert relative.returncode == 1
    assert not (project / "compose-up-called").exists()

    external_result = _run_batch8_deploy(project, external, external_sha)

    assert external_result.returncode == 0, external_result.stderr


def test_batch8_deploy_rejects_an_unmarked_parent_directory(tmp_path) -> None:
    project = _deploy_fixture(tmp_path, schema_state="empty")
    backup_dir, target_sha = _batch8_backup_dir(project)
    (backup_dir.parent / ".cvd-backup-root").unlink()

    result = _run_batch8_deploy(project, backup_dir, target_sha)

    assert result.returncode == 1
    assert "标记" in result.stderr


def test_batch8_deploy_rejects_symlink_dirty_tree_and_schema_bypass(tmp_path) -> None:
    project = _deploy_fixture(tmp_path, schema_state="empty")
    backup_dir, target_sha = _batch8_backup_dir(project)
    symlink = project / "backups" / "linked"
    symlink.symlink_to(backup_dir, target_is_directory=True)

    linked = _run_batch8_deploy(project, symlink, target_sha)
    dirty = _run_batch8_deploy(
        project,
        backup_dir,
        target_sha,
        BATCH8_FAKE_DIRTY="?? local-file\n",
    )
    bypass = _run_batch8_deploy(
        project,
        backup_dir,
        target_sha,
        SKIP_SCHEMA_GUARD="1",
    )

    assert linked.returncode == 1
    assert dirty.returncode == 1
    assert bypass.returncode == 1
    assert not (project / "compose-up-called").exists()


def test_batch8_deploy_requires_a_fresh_empty_schema(tmp_path) -> None:
    project = _deploy_fixture(tmp_path, schema_state="versioned")
    backup_dir, target_sha = _batch8_backup_dir(project)

    result = _run_batch8_deploy(project, backup_dir, target_sha)

    assert result.returncode == 1
    assert "schema" in result.stderr
    assert not (project / "compose-up-called").exists()


@pytest.mark.parametrize(
    "public_object_kind",
    [
        "view",
        "materialized-view",
        "sequence",
        "foreign-table",
        "function",
        "procedure",
        "enum",
        "domain",
    ],
)
def test_batch8_deploy_rejects_every_supported_public_object_class(
    tmp_path,
    public_object_kind: str,
) -> None:
    project = _deploy_fixture(
        tmp_path,
        schema_state="empty",
        public_object_kind=public_object_kind,
    )
    backup_dir, target_sha = _batch8_backup_dir(project)

    result = _run_batch8_deploy(project, backup_dir, target_sha)

    assert result.returncode == 1
    assert "fresh-empty" in result.stderr


def test_batch8_deploy_requires_the_backend_container_to_be_stopped(tmp_path) -> None:
    project = _deploy_fixture(tmp_path, schema_state="empty")
    backup_dir, target_sha = _batch8_backup_dir(project)

    result = _run_batch8_deploy(
        project,
        backup_dir,
        target_sha,
        BATCH8_FAKE_RUNNING="true",
    )

    assert result.returncode == 1
    assert "已停止" in result.stderr
    assert not (project / "compose-up-called").exists()


def test_batch8_deploy_requires_the_storage_volume_to_be_empty(tmp_path) -> None:
    project = _deploy_fixture(tmp_path, schema_state="empty")
    backup_dir, target_sha = _batch8_backup_dir(project)
    (project / "volume-data" / "orphan.bin").write_bytes(b"old")

    result = _run_batch8_deploy(project, backup_dir, target_sha)

    assert result.returncode == 1
    assert "空卷" in result.stderr
    assert not (project / "compose-up-called").exists()


def test_batch8_deploy_checks_the_stopped_container_not_the_host_mountpoint(
    tmp_path,
) -> None:
    project = _deploy_fixture(tmp_path, schema_state="empty")
    backup_dir, target_sha = _batch8_backup_dir(project)

    result = _run_batch8_deploy(
        project,
        backup_dir,
        target_sha,
        BATCH8_FAIL_VOLUME_INSPECT="1",
    )

    assert result.returncode == 0, result.stderr


def test_batch8_proof_freshness_cannot_be_extended_past_six_hours(tmp_path) -> None:
    project = _deploy_fixture(tmp_path, schema_state="empty")
    backup_dir, target_sha = _batch8_backup_dir(project)
    proof = backup_dir / "batch8-proof.env"
    proof.write_text(
        proof.read_text(encoding="utf-8").replace(
            next(
                line
                for line in proof.read_text(encoding="utf-8").splitlines()
                if line.startswith("VERIFIED_AT_EPOCH=")
            ),
            f"VERIFIED_AT_EPOCH={int(time.time()) - 21601}",
        ),
        encoding="utf-8",
    )
    proof.chmod(0o600)

    result = _run_batch8_deploy(
        project,
        backup_dir,
        target_sha,
        BATCH8_PROOF_MAX_AGE_SECONDS="999999999",
    )

    assert result.returncode == 1
    assert "过期" in result.stderr


def test_deploy_allows_confirmed_empty_database_for_initial_migration(tmp_path) -> None:
    project = _deploy_fixture(
        tmp_path,
        schema_state="empty",
    )

    result = _run_script(project, "deploy.sh", MAX_WAIT="1", HEALTH_POLL_INTERVAL="1")

    assert result.returncode == 0, result.stderr


def test_deploy_passes_validated_database_target_to_backup(tmp_path) -> None:
    project = _deploy_fixture(tmp_path, schema_state="empty")
    _executable(
        project / "backup.sh",
        """#!/usr/bin/env bash
[ "$COMPOSE_DATABASE_URL" = \
"postgresql+psycopg://fixture-user:fixture-password@fixture-postgres:5432/fixture-db" ] \
    && [ "$PG_CONTAINER" = "fixture-postgres" ] \
    && [ "$POSTGRES_USER" = "fixture-user" ] \
    && [ "$POSTGRES_DB" = "fixture-db" ]
""",
    )

    result = _run_script(project, "deploy.sh", MAX_WAIT="1", HEALTH_POLL_INTERVAL="1")

    assert result.returncode == 0, result.stderr


def test_deploy_fails_when_backup_script_is_missing(tmp_path) -> None:
    project = _deploy_fixture(tmp_path, schema_state="empty")
    (project / "backup.sh").unlink()

    result = _run_script(project, "deploy.sh")

    assert result.returncode == 1
    assert "backup.sh" in result.stderr


def test_deploy_rejects_nonempty_database_without_alembic_version(tmp_path) -> None:
    project = _deploy_fixture(
        tmp_path,
        schema_state="nonempty-no-alembic",
    )

    result = _run_script(project, "deploy.sh", MAX_WAIT="1", HEALTH_POLL_INTERVAL="1")

    assert result.returncode == 1
    assert "非空" in result.stderr


def test_deploy_allows_versioned_database_with_current_schema_fingerprint(tmp_path) -> None:
    project = _deploy_fixture(tmp_path, schema_state="versioned")

    result = _run_script(project, "deploy.sh", MAX_WAIT="1", HEALTH_POLL_INTERVAL="1")

    assert result.returncode == 0, result.stderr


def test_deploy_rejects_current_revision_with_stale_schema_shape(tmp_path) -> None:
    project = _deploy_fixture(
        tmp_path,
        schema_state="versioned",
        schema_fingerprint="mismatch",
    )

    result = _run_script(project, "deploy.sh", MAX_WAIT="1", HEALTH_POLL_INTERVAL="1")

    assert result.returncode == 1
    assert "schema 指纹" in result.stderr
    assert "重建" in result.stderr


@pytest.mark.parametrize(
    "file_asset_shape",
    [
        "missing-entity-columns",
        "run-scope-not-nullable",
        "missing-scope-check",
        "missing-type-check",
    ],
)
def test_deploy_rejects_versioned_database_with_legacy_file_asset_shape(
    tmp_path,
    file_asset_shape: str,
) -> None:
    project = _deploy_fixture(
        tmp_path,
        schema_state="versioned",
        file_asset_shape=file_asset_shape,
    )

    result = _run_script(project, "deploy.sh", MAX_WAIT="1", HEALTH_POLL_INTERVAL="1")

    assert result.returncode == 1
    assert "schema 指纹" in result.stderr


@pytest.mark.parametrize(
    "compose_status",
    [
        "backend|running|healthy",
        "backend|running|healthy\nfrontend|running|unhealthy",
        "backend|running|healthy\nfrontend|exited|healthy",
        "backend|running|healthy\nfrontend|running|healthy-ish",
    ],
)
def test_deploy_health_check_rejects_missing_or_nonhealthy_service(
    tmp_path,
    compose_status: str,
) -> None:
    project = _deploy_fixture(
        tmp_path,
        schema_state="versioned",
        compose_status=compose_status,
    )

    result = _run_script(project, "deploy.sh", MAX_WAIT="1", HEALTH_POLL_INTERVAL="1")

    assert result.returncode == 1
    assert "健康检查超时" in result.stderr


def test_operations_scripts_do_not_require_python() -> None:
    deploy = (REPO_ROOT / "deploy.sh").read_text(encoding="utf-8")
    backup = (REPO_ROOT / "backup.sh").read_text(encoding="utf-8")

    assert "python3" not in deploy
    assert "python3" not in backup
    assert "ps --all" in deploy
    assert "config --services" in deploy
    assert "load_database_target_from_env" in deploy
    assert "load_database_target_from_env" in backup
    assert 'source "$BATCH8_PROOF_FILE"' not in deploy
    assert "eval " not in deploy


def test_operations_scripts_do_not_embed_production_database_targets() -> None:
    scripts = "\n".join(
        (REPO_ROOT / name).read_text(encoding="utf-8") for name in ("backup.sh", "deploy.sh")
    )

    assert "1Panel-postgresql-4ljp" not in scripts
    assert "user_GztwJM" not in scripts


def _backup_fixture(
    tmp_path: Path,
    *,
    backend_container_ids: str = "backend-container",
    backend_running: bool = True,
    database_dump_succeeds: bool = True,
    storage_available: bool = True,
    storage_tar_succeeds: bool = True,
) -> Path:
    project = tmp_path / "project"
    project.mkdir()
    shutil.copy2(REPO_ROOT / "backup.sh", project / "backup.sh")
    (project / ".env").write_text(DATABASE_TARGET_ENV, encoding="utf-8")
    (project / "docker-compose.prod.yml").write_text("services: {}\n", encoding="utf-8")
    storage_source = project / "storage-source"
    storage_source.mkdir()
    (storage_source / "evidence.txt").write_text("storage archive\n", encoding="utf-8")
    fake_bin = project / "bin"
    fake_bin.mkdir()
    _executable(
        fake_bin / "docker",
        f"""#!/usr/bin/env bash
if [ "$1" = "exec" ]; then
    printf 'database dump\\n'
    exit {0 if database_dump_succeeds else 1}
fi
if [ "$1" = "cp" ]; then
    [ "{1 if storage_available else 0}" = "1" ] || exit 1
    /usr/bin/tar -cf - -C "$PWD/storage-source" .
    exit {0 if storage_tar_succeeds else 1}
fi
if [ "$1" = "compose" ]; then
    if [[ " $* " == *" ps -q --all backend "* ]]; then
        printf '%s\\n' '{backend_container_ids}'
        exit 0
    fi
    if [[ " $* " == *" backend test -d /data/storage "* ]]; then
        exit {0 if storage_available and backend_running else 1}
    fi
    if [[ " $* " == *" backend tar czf - /data/storage "* ]]; then
        /usr/bin/tar -czf - -C "$PWD/storage-source" .
        exit {0 if storage_tar_succeeds else 1}
    fi
fi
exit 1
""",
    )
    return project


def test_backup_archives_storage_from_a_stopped_backend_container(tmp_path) -> None:
    project = _backup_fixture(tmp_path, backend_running=False)

    result = _run_script(project, "backup.sh")

    assert result.returncode == 0, result.stderr
    [backup_dir] = _timestamp_backup_directories(project / "backups")
    with tarfile.open(backup_dir / "storage.tar.gz", "r:gz") as archive:
        assert any(name.endswith("evidence.txt") for name in archive.getnames())


@pytest.mark.parametrize("backend_container_ids", ["", "one\ntwo"])
def test_backup_requires_exactly_one_backend_container(
    tmp_path,
    backend_container_ids: str,
) -> None:
    project = _backup_fixture(
        tmp_path,
        backend_container_ids=backend_container_ids,
        backend_running=False,
    )

    result = _run_script(project, "backup.sh")

    assert result.returncode == 1
    assert "后端容器" in result.stderr
    assert _timestamp_backup_directories(project / "backups") == []


def test_backup_writes_checksums_for_both_artifacts(tmp_path) -> None:
    project = _backup_fixture(tmp_path)

    result = _run_script(project, "backup.sh")

    assert result.returncode == 0, result.stderr
    [backup_dir] = _timestamp_backup_directories(project / "backups")
    lines = (backup_dir / "SHA256SUMS").read_text(encoding="utf-8").splitlines()
    assert lines == [
        f"{hashlib.sha256((backup_dir / 'database.sql').read_bytes()).hexdigest()}  database.sql",
        (
            f"{hashlib.sha256((backup_dir / 'storage.tar.gz').read_bytes()).hexdigest()}"
            "  storage.tar.gz"
        ),
    ]


def test_backup_creates_private_directories_and_artifacts(tmp_path) -> None:
    project = _backup_fixture(tmp_path)

    result = _run_script(project, "backup.sh")

    assert result.returncode == 0, result.stderr
    backup_root = project / "backups"
    [backup_dir] = _timestamp_backup_directories(backup_root)
    assert stat.S_IMODE(backup_root.stat().st_mode) == 0o700
    assert stat.S_IMODE(backup_dir.stat().st_mode) == 0o700
    for name in ("database.sql", "storage.tar.gz", "SHA256SUMS"):
        assert stat.S_IMODE((backup_dir / name).stat().st_mode) == 0o600


def _set_env_value(project: Path, key: str, value: str | None) -> None:
    lines = (project / ".env").read_text(encoding="utf-8").splitlines()
    updated = [line for line in lines if not line.startswith(f"{key}=")]
    if value is not None:
        updated.append(f"{key}={value}")
    (project / ".env").write_text("\n".join(updated) + "\n", encoding="utf-8")


def _timestamp_backup_directories(backup_root: Path) -> list[Path]:
    if not backup_root.exists():
        return []
    return sorted(
        path
        for path in backup_root.iterdir()
        if path.is_dir() and len(path.name) == 15 and path.name[8] == "_"
    )


@pytest.mark.parametrize("script_name", ["backup.sh", "deploy.sh"])
@pytest.mark.parametrize(
    ("key", "value"),
    [
        ("COMPOSE_DATABASE_URL", None),
        ("COMPOSE_DATABASE_URL", "   "),
        (
            "COMPOSE_DATABASE_URL",
            "postgresql+psycopg://YOUR_USER:YOUR_PASSWORD@YOUR_HOST:5432/YOUR_DB",
        ),
        ("PG_CONTAINER", None),
        ("PG_CONTAINER", "   "),
        ("PG_CONTAINER", "YOUR_POSTGRES_CONTAINER"),
        ("POSTGRES_USER", None),
        ("POSTGRES_USER", "   "),
        ("POSTGRES_USER", "YOUR_POSTGRES_USER"),
        ("POSTGRES_DB", None),
        ("POSTGRES_DB", "   "),
        ("POSTGRES_DB", "YOUR_POSTGRES_DB"),
    ],
)
def test_database_target_fields_fail_closed(
    tmp_path,
    script_name: str,
    key: str,
    value: str | None,
) -> None:
    project = (
        _backup_fixture(tmp_path)
        if script_name == "backup.sh"
        else _deploy_fixture(tmp_path, schema_state="empty")
    )
    _set_env_value(project, key, value)

    result = _run_script(project, script_name)

    assert result.returncode == 1
    assert "数据库目标配置" in result.stderr
    assert key in result.stderr


@pytest.mark.parametrize("script_name", ["backup.sh", "deploy.sh"])
@pytest.mark.parametrize("key", ["PG_CONTAINER", "POSTGRES_USER", "POSTGRES_DB"])
def test_database_target_fields_must_match_compose_url(
    tmp_path,
    script_name: str,
    key: str,
) -> None:
    project = (
        _backup_fixture(tmp_path)
        if script_name == "backup.sh"
        else _deploy_fixture(tmp_path, schema_state="empty")
    )
    _set_env_value(project, key, f"other-{key.lower()}")

    result = _run_script(project, script_name)

    assert result.returncode == 1
    assert "COMPOSE_DATABASE_URL" in result.stderr
    assert key in result.stderr


def test_backup_rejects_repository_root_as_backup_directory(tmp_path) -> None:
    project = _backup_fixture(tmp_path)

    result = _run_script(project, "backup.sh", BACKUP_DIR=str(project))

    assert result.returncode == 1
    assert "专用备份目录" in result.stderr


def test_backup_retention_only_removes_timestamped_backup_directories(tmp_path) -> None:
    project = _backup_fixture(tmp_path)
    backup_root = project / "cvd-backups"
    backup_root.mkdir()
    old_backup = backup_root / "20260101_000000"
    unrelated = backup_root / "research-data"
    old_backup.mkdir()
    unrelated.mkdir()
    old = time.time() - 10 * 24 * 60 * 60
    os.utime(old_backup, (old, old))
    os.utime(unrelated, (old, old))

    result = _run_script(
        project,
        "backup.sh",
        BACKUP_DIR=str(backup_root),
        RETENTION_DAYS="7",
    )

    assert result.returncode == 0, result.stderr
    assert not old_backup.exists()
    assert unrelated.exists()


def test_backup_fails_when_storage_is_unavailable(tmp_path) -> None:
    project = _backup_fixture(tmp_path, storage_available=False)

    result = _run_script(project, "backup.sh")

    assert result.returncode == 1
    assert "文件存储" in result.stderr
    assert _timestamp_backup_directories(project / "backups") == []


def test_backup_fails_when_storage_archive_fails(tmp_path) -> None:
    project = _backup_fixture(tmp_path, storage_tar_succeeds=False)

    result = _run_script(project, "backup.sh")

    assert result.returncode == 1
    assert "文件存储" in result.stderr
    assert _timestamp_backup_directories(project / "backups") == []


def test_backup_removes_partial_directory_when_database_dump_fails(tmp_path) -> None:
    project = _backup_fixture(tmp_path, database_dump_succeeds=False)

    result = _run_script(project, "backup.sh")

    assert result.returncode == 1
    assert "数据库备份失败" in result.stderr
    assert _timestamp_backup_directories(project / "backups") == []


def test_backup_failure_does_not_remove_existing_backups(tmp_path) -> None:
    project = _backup_fixture(tmp_path, storage_available=False)
    backup_root = project / "cvd-backups"
    existing_backup = backup_root / "20260101_000000"
    existing_backup.mkdir(parents=True)
    evidence = existing_backup / "database.sql"
    evidence.write_text("existing backup\n", encoding="utf-8")

    result = _run_script(project, "backup.sh", BACKUP_DIR=str(backup_root))

    assert result.returncode == 1
    assert evidence.read_text(encoding="utf-8") == "existing backup\n"
    assert _timestamp_backup_directories(backup_root) == [existing_backup]


def test_backup_rejects_symlink_to_non_backup_directory(tmp_path) -> None:
    project = _backup_fixture(tmp_path)
    victim = tmp_path / "research-data"
    victim.mkdir()
    old_backup = victim / "20260101_000000"
    old_backup.mkdir()
    victim.chmod(0o755)
    symlink = project / "safe-backup"
    symlink.symlink_to(victim, target_is_directory=True)

    result = _run_script(
        project,
        "backup.sh",
        BACKUP_DIR=str(symlink),
        RETENTION_DAYS="0",
    )

    assert result.returncode == 1
    assert stat.S_IMODE(victim.stat().st_mode) == 0o755
    assert not (victim / ".cvd-backup-root").exists()
    assert old_backup.exists()


def test_backup_rejects_symlink_even_when_target_name_contains_backup(tmp_path) -> None:
    project = _backup_fixture(tmp_path)
    victim = tmp_path / "research-backups"
    victim.mkdir()
    victim.chmod(0o755)
    symlink = project / "safe-backup"
    symlink.symlink_to(victim, target_is_directory=True)

    result = _run_script(project, "backup.sh", BACKUP_DIR=str(symlink))

    assert result.returncode == 1
    assert stat.S_IMODE(victim.stat().st_mode) == 0o755
    assert not (victim / ".cvd-backup-root").exists()


def test_backend_image_copies_runtime_field_source() -> None:
    dockerfile = (REPO_ROOT / "backend" / "Dockerfile").read_text(encoding="utf-8")

    assert "COPY docs/standard/field-source.yaml /app/docs/standard/field-source.yaml" in dockerfile


@pytest.mark.parametrize("compose_name", ["docker-compose.yml", "docker-compose.prod.yml"])
def test_compose_passes_experiment_timezone_to_backend(compose_name: str) -> None:
    compose = yaml.safe_load((REPO_ROOT / compose_name).read_text(encoding="utf-8"))

    assert (
        compose["services"]["backend"]["environment"]["EXPERIMENT_TIMEZONE"]
        == "${EXPERIMENT_TIMEZONE:-Asia/Shanghai}"
    )


@pytest.mark.parametrize("env_name", [".env.example", ".env.production.example"])
def test_environment_examples_document_experiment_timezone(env_name: str) -> None:
    example = (REPO_ROOT / env_name).read_text(encoding="utf-8")

    assert "EXPERIMENT_TIMEZONE=Asia/Shanghai" in example


def test_production_environment_declares_shared_database_targets() -> None:
    example = (REPO_ROOT / ".env.production.example").read_text(encoding="utf-8")

    assert (
        "COMPOSE_DATABASE_URL=postgresql+psycopg://"
        "YOUR_1PANEL_POSTGRES_USER:YOUR_URL_ENCODED_DB_PASSWORD"
        "@YOUR_1PANEL_POSTGRES_CONTAINER:5432/cvd"
    ) in example
    assert "PG_CONTAINER=YOUR_1PANEL_POSTGRES_CONTAINER" in example
    assert "POSTGRES_DB=cvd" in example
    assert "POSTGRES_USER=YOUR_1PANEL_POSTGRES_USER" in example
    assert "必须指向同一个" in example
