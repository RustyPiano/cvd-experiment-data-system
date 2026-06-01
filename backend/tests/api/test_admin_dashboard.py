from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient

from app.main import app
from app.models.experiment import ExperimentRun, ExperimentStatus, QualityLabel
from app.models.user import User, UserRole

client = TestClient(app)


def login(email: str, password: str = "Password123!") -> str:
    response = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )
    assert response.status_code == 200
    return response.json()["access_token"]


def auth_headers(email: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {login(email)}"}


def create_member(db_session, *, email: str, name: str) -> User:
    user = User(
        email=email,
        name=name,
        password_hash="unused-test-hash",
        role=UserRole.MEMBER,
        is_active=True,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


def add_experiment(
    db_session,
    *,
    owner: User,
    run_code: str,
    status: ExperimentStatus,
    created_at: datetime,
    updated_at: datetime,
) -> ExperimentRun:
    experiment = ExperimentRun(
        run_code=run_code,
        owner_id=owner.id,
        experiment_type="cvd_2zone",
        material_system="MoS2",
        experiment_date=created_at.date(),
        objective=run_code,
        status=status,
        quality_label=QualityLabel.UNKNOWN,
        created_at=created_at,
        updated_at=updated_at,
    )
    db_session.add(experiment)
    db_session.commit()
    db_session.refresh(experiment)
    return experiment


def test_admin_dashboard_overview_aggregates_records_and_reconciles_members(
    db_session,
    admin_user,
    active_user,
    inactive_user,
    viewer_user,
) -> None:
    now = datetime.now(UTC)
    zero_member = create_member(db_session, email="zero@example.com", name="Zero Member")
    add_experiment(
        db_session,
        owner=active_user,
        run_code="CVD-2026-1001",
        status=ExperimentStatus.DRAFT,
        created_at=now - timedelta(days=20),
        updated_at=now - timedelta(days=20),
    )
    add_experiment(
        db_session,
        owner=active_user,
        run_code="CVD-2026-1002",
        status=ExperimentStatus.SUBMITTED,
        created_at=now,
        updated_at=now - timedelta(days=1),
    )
    add_experiment(
        db_session,
        owner=admin_user,
        run_code="CVD-2026-1003",
        status=ExperimentStatus.LOCKED,
        created_at=now,
        updated_at=now - timedelta(days=4),
    )
    add_experiment(
        db_session,
        owner=inactive_user,
        run_code="CVD-2026-1004",
        status=ExperimentStatus.INVALID,
        created_at=now,
        updated_at=now - timedelta(days=1),
    )

    response = client.get(
        "/api/v1/admin/dashboard/overview?trend_weeks=4&stale_days=14",
        headers=auth_headers(admin_user.email),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["totals"] == {
        "total": 4,
        "draft": 1,
        "submitted": 1,
        "locked": 1,
        "invalid": 1,
        "this_week_new": 3,
    }

    members_by_email = {member["email"]: member for member in body["members"]}
    # Active admin/member accounts and any record-owner (even the now-inactive one) are
    # listed; the active viewer with no records stays out.
    assert set(members_by_email) == {
        admin_user.email,
        active_user.email,
        inactive_user.email,
        zero_member.email,
    }
    assert viewer_user.email not in members_by_email
    assert members_by_email[active_user.email]["total"] == 2
    assert members_by_email[active_user.email]["draft"] == 1
    assert members_by_email[active_user.email]["submitted"] == 1
    assert members_by_email[active_user.email]["stale_draft_count"] == 1
    assert members_by_email[active_user.email]["is_active"] is True
    assert members_by_email[inactive_user.email]["total"] == 1
    assert members_by_email[inactive_user.email]["invalid"] == 1
    assert members_by_email[inactive_user.email]["is_active"] is False
    assert members_by_email[zero_member.email]["total"] == 0
    assert members_by_email[zero_member.email]["last_activity_at"] is None
    # Per-member totals reconcile with the global totals card.
    assert sum(member["total"] for member in body["members"]) == body["totals"]["total"]
    assert sum(point["count"] for point in body["trend"]) == 3


def test_admin_dashboard_requires_admin(active_user, viewer_user) -> None:
    member_response = client.get(
        "/api/v1/admin/dashboard/overview",
        headers=auth_headers(active_user.email),
    )
    viewer_response = client.get(
        "/api/v1/admin/dashboard/overview",
        headers=auth_headers(viewer_user.email),
    )

    assert member_response.status_code == 403
    assert viewer_response.status_code == 403


def test_admin_can_filter_experiment_list_by_owner_id(
    db_session,
    admin_user,
    active_user,
) -> None:
    now = datetime.now(UTC)
    target = add_experiment(
        db_session,
        owner=active_user,
        run_code="CVD-2026-2001",
        status=ExperimentStatus.DRAFT,
        created_at=now,
        updated_at=now,
    )
    add_experiment(
        db_session,
        owner=admin_user,
        run_code="CVD-2026-2002",
        status=ExperimentStatus.DRAFT,
        created_at=now,
        updated_at=now,
    )

    response = client.get(
        f"/api/v1/experiments?owner_id={active_user.id}",
        headers=auth_headers(admin_user.email),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert [item["id"] for item in body["items"]] == [str(target.id)]
