from sqlalchemy.orm import Session

from app.models.equipment import Equipment
from app.models.equipment_type import EquipmentType
from app.models.station import Station

# Reference data inserted on every startup. Idempotent (skips rows that already exist),
# so editing this list adds new entries to existing databases but never removes or renames.

_DEFAULT_STATIONS = [
    "Victoria",
    "Waterloo",
    "Paddington",
    "King's Cross",
    "London Bridge",
]

_DEFAULT_EQUIPMENT_TYPES = ["lift", "escalator"]

# (station_name, equipment_type_name, connection)
_DEFAULT_EQUIPMENT = [
    ("Victoria", "lift", "street to platform 1"),
    ("Victoria", "escalator", "street to platform 2"),
    ("Waterloo", "lift", "street to platform 1"),
    ("Waterloo", "escalator", "street to platform 2"),
    ("Paddington", "lift", "street to platform 1"),
    ("Paddington", "escalator", "street to platform 2"),
    ("King's Cross", "lift", "street to platform 1"),
    ("King's Cross", "escalator", "street to platform 2"),
    ("London Bridge", "lift", "street to platform 1"),
    ("London Bridge", "escalator", "street to platform 2"),
]


def seed_defaults(db: Session) -> None:
    """Insert default stations, equipment types, and equipment if they aren't already present."""
    for name in _DEFAULT_STATIONS:
        if not db.query(Station).filter_by(name=name).first():
            db.add(Station(name=name))
    for name in _DEFAULT_EQUIPMENT_TYPES:
        if not db.query(EquipmentType).filter_by(name=name).first():
            db.add(EquipmentType(name=name))
    db.flush()

    for station_name, equipment_type_name, connection in _DEFAULT_EQUIPMENT:
        station = db.query(Station).filter_by(name=station_name).one()
        equipment_type = db.query(EquipmentType).filter_by(name=equipment_type_name).one()
        if not db.query(Equipment).filter_by(
            station_id=station.id,
            equipment_type_id=equipment_type.id,
            connection=connection,
        ).first():
            db.add(Equipment(
                station_id=station.id,
                equipment_type_id=equipment_type.id,
                connection=connection,
            ))
    db.commit()
