#!/usr/bin/env python
"""Remove lift equipment rows that were seeded using the old description format.

Background: lift_connection() previously preferred a 'description' field (e.g.
"Lift 1: Westbound hall ↔ Eastbound platforms 3 and 4") over the structured from/to
fields ("Lift 1: Westbound hall → Eastbound Platform 4, Eastbound Platform 3").
Both formats ended up in the database as separate rows (different strings, different
unique-constraint key), causing every lift to appear twice in the report picker.

This script deletes all equipment rows whose connection string contains '↔'. Those
are exclusively the old description-format rows — escalators and all other equipment
types always used '→', and the new seed never produces '↔'. The '→' counterparts
for each lift already exist and are the correct rows.

Safe to run multiple times (idempotent). Does NOT touch outage reports or failures.

Run from backend/ with the venv active and DATABASE_URL pointing at the target:

    python scripts/remove_lift_description_duplicates.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database import SessionLocal
from app.models.equipment import Equipment


def main() -> None:
    with SessionLocal() as db:
        duplicates = db.query(Equipment).filter(Equipment.connection.contains('↔')).all()

        if not duplicates:
            print("Nothing to remove — no ↔ format rows found.")
            return

        print(f"Found {len(duplicates)} rows to remove:")
        for e in duplicates:
            print(f"  id={e.id}  {e.connection}")

        db.query(Equipment).filter(Equipment.connection.contains('↔')).delete(
            synchronize_session=False
        )
        db.commit()
        print(f"\nDeleted {len(duplicates)} rows. Restart the backend to clear the in-memory cache.")


if __name__ == "__main__":
    main()
