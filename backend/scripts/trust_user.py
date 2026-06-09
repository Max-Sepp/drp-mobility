#!/usr/bin/env python
"""Promote a user account to TRUSTED role.

Run from `backend/` with the venv active. `DATABASE_URL` selects the target.

    python scripts/trust_user.py <username>
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database import SessionLocal  # noqa: E402

# Import every model so SQLAlchemy can resolve the User mapper's relationships (sessions, journeys,
# etc.) before we query. Keep this list in sync with app/main.py — there is no models/__init__.py
# that imports them.
from app.models import equipment as _equipment  # noqa: E402, F401
from app.models import equipment_type as _equipment_type  # noqa: E402, F401
from app.models import failure as _failure  # noqa: E402, F401
from app.models import line as _line  # noqa: E402, F401
from app.models import outage_report as _outage_report  # noqa: E402, F401
from app.models import outage_report_deletion as _outage_report_deletion  # noqa: E402, F401
from app.models import outage_report_verification as _outage_report_verification  # noqa: E402, F401
from app.models import platform as _platform  # noqa: E402, F401
from app.models import push_token as _push_token  # noqa: E402, F401
from app.models import saved_journey as _saved_journey  # noqa: E402, F401
from app.models import saved_place as _saved_place  # noqa: E402, F401
from app.models import session as _session  # noqa: E402, F401
from app.models import station as _station  # noqa: E402, F401
from app.models.user import User, UserRole  # noqa: E402


def trust_user(username: str) -> None:
    with SessionLocal() as session:
        user = session.query(User).filter_by(username=username).first()
        if user is None:
            print(f"Error: no user with username '{username}'.")
            sys.exit(1)
        if user.role == UserRole.TRUSTED.value:
            print(f"'{username}' is already TRUSTED.")
            return
        user.role = UserRole.TRUSTED.value
        session.commit()
        print(f"'{username}' promoted to TRUSTED.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Promote a user to TRUSTED role.")
    parser.add_argument("username", help="Username of the account to promote.")
    args = parser.parse_args()
    trust_user(args.username)


if __name__ == "__main__":
    main()
