from fastapi.testclient import TestClient

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _signup(client: TestClient, username: str = "alice", password: str = "password123"):
    return client.post("/auth/signup", json={"username": username, "password": password})


# ---------------------------------------------------------------------------
# POST /auth/signup
# ---------------------------------------------------------------------------


def test_signup_returns_token_and_untrusted_user(client: TestClient) -> None:
    response = _signup(client)

    assert response.status_code == 201
    body = response.json()
    assert body["token"]
    assert body["user"]["username"] == "alice"
    # Every account is created untrusted; trusted status is granted out-of-band later.
    assert body["user"]["role"] == "untrusted"


def test_signup_duplicate_username_returns_409(client: TestClient) -> None:
    _signup(client)

    response = _signup(client)

    assert response.status_code == 409


def test_signup_missing_password_returns_422(client: TestClient) -> None:
    response = client.post("/auth/signup", json={"username": "alice"})

    assert response.status_code == 422


# ---------------------------------------------------------------------------
# POST /auth/login
# ---------------------------------------------------------------------------


def test_login_with_valid_credentials_returns_token(client: TestClient) -> None:
    _signup(client)

    response = client.post("/auth/login", json={"username": "alice", "password": "password123"})

    assert response.status_code == 200
    assert response.json()["token"]


def test_login_with_wrong_password_returns_401(client: TestClient) -> None:
    _signup(client)

    response = client.post("/auth/login", json={"username": "alice", "password": "wrong"})

    assert response.status_code == 401


def test_login_with_unknown_user_returns_401(client: TestClient) -> None:
    response = client.post("/auth/login", json={"username": "nobody", "password": "password123"})

    assert response.status_code == 401


# ---------------------------------------------------------------------------
# GET /auth/me
# ---------------------------------------------------------------------------


def test_me_with_valid_token_returns_user(client: TestClient) -> None:
    token = _signup(client).json()["token"]

    response = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 200
    assert response.json()["username"] == "alice"


def test_me_without_token_returns_401(client: TestClient) -> None:
    response = client.get("/auth/me")

    assert response.status_code == 401


def test_me_with_invalid_token_returns_401(client: TestClient) -> None:
    response = client.get("/auth/me", headers={"Authorization": "Bearer not-a-real-token"})

    assert response.status_code == 401


# ---------------------------------------------------------------------------
# POST /auth/logout
# ---------------------------------------------------------------------------


def test_logout_invalidates_token(client: TestClient) -> None:
    token = _signup(client).json()["token"]
    headers = {"Authorization": f"Bearer {token}"}

    logout = client.post("/auth/logout", headers=headers)
    assert logout.status_code == 204

    # The token must no longer authenticate after logout.
    assert client.get("/auth/me", headers=headers).status_code == 401


def test_logout_without_token_returns_401(client: TestClient) -> None:
    response = client.post("/auth/logout")

    assert response.status_code == 401
