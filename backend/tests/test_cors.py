from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_cors_preflight_allows_local_vite_origin() -> None:
    response = client.options(
        "/api/v1/auth/login",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "POST",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"


def test_cors_exposes_download_header_for_allowed_origin() -> None:
    response = client.get(
        "/health",
        headers={"Origin": "http://localhost:5173"},
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
    assert response.headers["access-control-expose-headers"] == "Content-Disposition"


def test_cors_does_not_allow_unlisted_origin() -> None:
    response = client.get(
        "/health",
        headers={"Origin": "http://malicious.local"},
    )

    assert response.status_code == 200
    assert "access-control-allow-origin" not in response.headers
