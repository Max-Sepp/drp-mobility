#!/usr/bin/env python
"""Drop, recreate, and reseed the configured database from scratch.

This is the Postgres-and-SQLite equivalent of the documented `rm dev.db` reset. Because
`seed_defaults` is insert-if-missing, simply restarting the app never refreshes edited
reference data (e.g. changes to `data/stations.json`) — the only way to pick those up on an
existing database is to drop the tables and rebuild. This script does exactly that.

WARNING: it drops EVERY table, including user-submitted `outage_reports` and `failures`, not
just the seeded reference data. On a production database that data is irrecoverable. Intended
for throwaway dev/staging databases.

Run from `backend/` with the venv active. `DATABASE_URL` selects the target (Postgres in
prod-like setups; otherwise the local SQLite `dev.db`).

    python scripts/reseed.py          # prompts for confirmation
    python scripts/reseed.py --yes    # skip the prompt (scripted / CI use)
"""

import argparse
import sys
from pathlib import Path

# Allow running as `python scripts/reseed.py` (not just `python -m scripts.reseed`) by putting
# the backend root — the parent of this scripts/ dir — on the import path.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database import Base, SessionLocal, engine  # noqa: E402

# Import every model module so its table is registered on Base.metadata before drop/create.
# Keep this list in sync with app/main.py (there is no models/__init__.py that imports them).
from app.models import equipment as _equipment  # noqa: E402, F401
from app.models import equipment_type as _equipment_type  # noqa: E402, F401
from app.models import failure as _failure  # noqa: E402, F401
from app.models import line as _line  # noqa: E402, F401
from app.models import outage_report as _outage_report  # noqa: E402, F401
from app.models import outage_report_deletion as _outage_report_deletion  # noqa: E402, F401
from app.models import outage_report_verification as _outage_report_verification  # noqa: E402, F401
from app.models import platform as _platform  # noqa: E402, F401
from app.models import push_token as _push_token  # noqa: E402, F401
from app.models import recent_location as _recent_location  # noqa: E402, F401
from app.models import saved_journey as _saved_journey  # noqa: E402, F401
from app.models import saved_place as _saved_place  # noqa: E402, F401
from app.models import session as _session  # noqa: E402, F401
from app.models import station as _station  # noqa: E402, F401
from app.models import station_alert as _station_alert  # noqa: E402, F401
from app.models import user as _user  # noqa: E402, F401
from app.seed import seed_defaults  # noqa: E402


def reseed() -> None:
    """Drop all tables, recreate the schema, and repopulate reference data."""
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as session:
        seed_defaults(session)  # commits internally


def main() -> None:
    parser = argparse.ArgumentParser(description="Drop, recreate, and reseed the database.")
    parser.add_argument("-y", "--yes", action="store_true", help="Skip the confirmation prompt.")
    args = parser.parse_args()

    target = engine.url.render_as_string(hide_password=True)
    print(f"This will DROP ALL TABLES and reseed: {target}")
    print("All user-submitted outage reports and failures will be permanently lost.")
    if not args.yes:
        if input("Type 'yes' to continue: ").strip().lower() != "yes":
            print("Aborted.")
            return

    print("Dropping and recreating schema…")
    reseed()
    print("Done. Reference data reseeded from data/stations.json.")


if __name__ == "__main__":
    main()
