from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.station import Station

# ---------------------------------------------------------------------------
# GET /stations
# ---------------------------------------------------------------------------


def test_list_stations_returns_seeded_stations(client: TestClient) -> None:
    response = client.get("/stations")

    assert response.status_code == 200
    names = {s["name"] for s in response.json()}
    # The seed is the full London Underground network; assert a few well-known members are present.
    assert {"Victoria", "Waterloo", "Paddington", "London Bridge"} <= names
    assert len(names) > 100


def test_list_stations_have_ids(client: TestClient) -> None:
    response = client.get("/stations")

    assert all("id" in s for s in response.json())


# ---------------------------------------------------------------------------
# GET /equipment-types
# ---------------------------------------------------------------------------


def test_list_equipment_types_returns_seeded_types(client: TestClient) -> None:
    response = client.get("/equipment-types")

    assert response.status_code == 200
    names = {t["name"] for t in response.json()}
    assert names == {"lift", "escalator"}


def test_list_equipment_types_have_ids(client: TestClient) -> None:
    response = client.get("/equipment-types")

    assert all("id" in t for t in response.json())


# ---------------------------------------------------------------------------
# GET /equipment
# ---------------------------------------------------------------------------


def test_list_equipment_returns_all_seeded_equipment(client: TestClient) -> None:
    response = client.get("/equipment")

    assert response.status_code == 200
    # One row per lift / escalator across the seeded network (counts come from TfL facility data).
    assert len(response.json()) > 100


def test_list_equipment_items_have_nested_station_and_type(client: TestClient) -> None:
    response = client.get("/equipment")

    item = response.json()[0]
    assert "id" in item
    assert "connection" in item
    assert "name" in item["station"]
    assert "name" in item["equipment_type"]


def test_list_equipment_filter_by_station(client: TestClient, db_session: Session) -> None:
    station_id = db_session.query(Station).filter_by(name="Victoria").one().id

    response = client.get(f"/equipment?station_id={station_id}")

    assert response.status_code == 200
    items = response.json()
    assert len(items) >= 2  # Victoria has at least one lift and one escalator
    assert all(e["station"]["name"] == "Victoria" for e in items)


def test_list_equipment_filter_unknown_station_returns_empty(client: TestClient) -> None:
    response = client.get("/equipment?station_id=9999")

    assert response.status_code == 200
    assert response.json() == []
