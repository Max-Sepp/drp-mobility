import os
from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

# Production deployments (Heroku, Railway, etc.) inject a DATABASE_URL pointing at Postgres;
# local development falls back to a SQLite file at ./dev.db so no setup is needed.
_database_url = os.environ.get("DATABASE_URL")

if _database_url:
    # Normalize "postgres://" → "postgresql://" for SQLAlchemy 2.x compatibility
    # (providers like Heroku and Railway still emit the legacy scheme)
    if _database_url.startswith("postgres://"):
        _database_url = _database_url.replace("postgres://", "postgresql://", 1)
    engine = create_engine(_database_url)
else:
    _database_url = "sqlite:///./dev.db"
    # check_same_thread=False is required because FastAPI may share a SQLite
    # connection across the request and the background thread that closes it.
    engine = create_engine(
        _database_url,
        connect_args={"check_same_thread": False},
    )

# Session factory used both by request-scoped `get_db` and by startup tasks (e.g. seeding).
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    """Declarative base shared by every ORM model so they register on one metadata."""


def get_db() -> Iterator[Session]:
    """FastAPI dependency that yields a Session and guarantees it is closed after the request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
