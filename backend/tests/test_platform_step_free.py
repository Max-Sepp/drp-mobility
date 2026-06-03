"""Tests for per-platform step-free access and the station summary derived from it.

A station no longer stores its own step-free value. The platforms within one station often
differ — at an interchange one line's platforms may be step-free to the train while another's
have no step-free access at all — so each `Platform` carries its own `step_free`, seeded from
the dataset's per-platform `stepFreeAccess`. The station's `step_free` is *derived*: the
strongest access any of its platforms offers.
"""

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.platform import Platform, PlatformStepFree
from app.models.station import Station, StepFree


def _platform(db: Session, station_name: str, platform_name: str) -> Platform:
    station = db.query(Station).filter_by(name=station_name).one()
    return db.query(Platform).filter_by(station_id=station.id, name=platform_name).one()


def _station(db: Session, name: str) -> Station:
    return db.query(Station).filter_by(name=name).one()


# --- per-platform step-free -------------------------------------------------


def test_platform_step_free_is_seeded(db_session: Session) -> None:
    # Barbican's two platforms have opposite step-free access in the dataset.
    eastbound = _platform(db_session, "Barbican", "Eastbound Platform 1")
    westbound = _platform(db_session, "Barbican", "Westbound Platform 2")

    assert eastbound.step_free is PlatformStepFree.NONE
    assert westbound.step_free is PlatformStepFree.FULL


def test_mixed_step_free_within_one_station(db_session: Session) -> None:
    # The motivating case: one platform step-free, another not, in the same station.
    westbound = _platform(db_session, "Aldgate East", "Westbound Platform 1")
    eastbound = _platform(db_session, "Aldgate East", "Eastbound Platform 2")

    assert westbound.step_free is PlatformStepFree.TO_TRAIN
    assert eastbound.step_free is PlatformStepFree.NONE
    assert westbound.step_free is not eastbound.step_free


def test_capitalised_full_is_normalised_to_lowercase(db_session: Session) -> None:
    # The dataset stores "Full" (capitalised); we persist the portable lower-case value.
    westbound = _platform(db_session, "Barbican", "Westbound Platform 2")
    assert westbound.step_free.value == "full"


# --- derived station summary ------------------------------------------------


def test_station_step_free_derived_to_vehicle(db_session: Session) -> None:
    # Barbican has a "Full" platform, so the strongest access is step-free to the vehicle.
    assert _station(db_session, "Barbican").step_free is StepFree.TO_VEHICLE


def test_station_step_free_derived_to_platform(db_session: Session) -> None:
    # Abbey Road's platforms are all only step-free to platform.
    assert _station(db_session, "Abbey Road").step_free is StepFree.TO_PLATFORM


def test_station_step_free_derived_none(db_session: Session) -> None:
    # Aldgate's platforms are all "none", so the station offers no step-free access.
    assert _station(db_session, "Aldgate").step_free is StepFree.NONE


def test_to_train_platform_promotes_station_to_vehicle(db_session: Session) -> None:
    # Aldgate East: one platform "to_train" (the rest "none") => station is to_vehicle,
    # derived purely from platforms (regardless of TfL's published station summary).
    assert _station(db_session, "Aldgate East").step_free is StepFree.TO_VEHICLE


def test_station_with_no_platforms_is_none() -> None:
    # Defensive: a station with no platforms derives to NONE rather than erroring.
    assert Station(name="Nowhere").step_free is StepFree.NONE


def test_station_has_no_stored_step_free_column() -> None:
    # The value is derived, not persisted: there must be no `step_free` column.
    assert "step_free" not in Station.__table__.columns


# --- /stations endpoint exposes platforms -----------------------------------


def test_stations_endpoint_embeds_platforms_with_step_free(client: TestClient) -> None:
    stations = {s["name"]: s for s in client.get("/stations").json()}

    barbican = stations["Barbican"]
    assert barbican["step_free"] == "to_vehicle"  # derived summary still present
    platforms = {p["name"]: p for p in barbican["platforms"]}
    assert platforms["Eastbound Platform 1"]["step_free"] == "none"
    assert platforms["Westbound Platform 2"]["step_free"] == "full"


def test_stations_endpoint_platforms_carry_line_names(client: TestClient) -> None:
    stations = {s["name"]: s for s in client.get("/stations").json()}

    abbey_road = stations["Abbey Road"]
    platform = abbey_road["platforms"][0]
    assert platform["lines"] == ["DLR"]
    assert set(stations["Barbican"]["platforms"][0]["lines"]) == {
        "Circle",
        "Hammersmith & City",
        "Metropolitan",
    }
