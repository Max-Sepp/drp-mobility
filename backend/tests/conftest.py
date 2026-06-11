import os
from collections.abc import Callable, Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
from app.models.user import UserRole
from app.repositories.user import UserRepository
from app.seed import seed_defaults

# The app lifespan starts an in-process TfL poll loop unless disabled. The `client` fixture enters
# that lifespan, so force it off for the whole suite to keep tests hermetic (no network). The loop
# only starts at lifespan entry (TestClient enter), so setting this after import is sufficient.
os.environ["TFL_POLL_ENABLED"] = "false"


@pytest.fixture
def db_session() -> Iterator[Session]:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    session = TestingSessionLocal()
    seed_defaults(session)
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture
def client(db_session: Session) -> Iterator[TestClient]:
    def override_get_db() -> Iterator[Session]:
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def auth_headers_factory(db_session: Session) -> Callable[..., dict[str, str]]:
    """Return a factory that creates a user with the given role and returns Bearer auth headers.

    Signup always yields an `untrusted` user, so to exercise trusted-reporter behaviour we set the
    role directly on the freshly created row before minting a session token.
    """
    repo = UserRepository(db_session)
    counter = {"n": 0}

    def _make(role: UserRole = UserRole.UNTRUSTED) -> dict[str, str]:
        counter["n"] += 1
        user = repo.create(f"user{counter['n']}", "password123")
        if role != UserRole.UNTRUSTED:
            user.role = role.value
            db_session.commit()
        session = repo.create_session(user)
        return {"Authorization": f"Bearer {session.token}"}

    return _make
