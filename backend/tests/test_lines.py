"""Tests for the normalised line storage: a `lines` table that platforms reference.

Lines used to be a comma-separated string on `platforms.lines`. They are now first-class
`Line` rows, linked to platforms many-to-many, so a line has a single canonical name.
"""

from sqlalchemy.orm import Session

from app.models.line import Line
from app.models.platform import Platform
from app.models.station import Station


def _platform(db: Session, station_name: str, platform_name: str) -> Platform:
    station = db.query(Station).filter_by(name=station_name).one()
    return db.query(Platform).filter_by(station_id=station.id, name=platform_name).one()


def test_lines_seeded_with_canonical_names(db_session: Session) -> None:
    names = {line.name for line in db_session.query(Line).all()}
    assert {"District", "Victoria", "DLR", "National Rail", "Hammersmith & City"} <= names
    # The acronym must not have been title-cased into a separate "Dlr".
    assert "Dlr" not in names


def test_line_names_are_unique(db_session: Session) -> None:
    names = [line.name for line in db_session.query(Line).all()]
    assert len(names) == len(set(names))
    assert sum(1 for n in names if n == "DLR") == 1


def test_platform_references_lines_as_a_list(db_session: Session) -> None:
    platform = _platform(db_session, "Acton Town", "District line — Platform 1")

    assert [line.name for line in platform.lines] == ["District"]
    assert all(isinstance(line, Line) for line in platform.lines)


def test_platform_with_multiple_lines(db_session: Session) -> None:
    platform = _platform(db_session, "Baker Street", "Circle/Hammersmith & City line — Platform 1")

    assert {line.name for line in platform.lines} == {"Circle", "Hammersmith & City"}


def test_same_line_shared_across_platforms(db_session: Session) -> None:
    # Two District platforms must point at the *same* Line row, not duplicates.
    p1 = _platform(db_session, "Acton Town", "District line — Platform 1")
    p2 = _platform(db_session, "Acton Town", "District line — Platform 2")

    district1 = next(line for line in p1.lines if line.name == "District")
    district2 = next(line for line in p2.lines if line.name == "District")
    assert district1.id == district2.id
