import pytest
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
    assert names == {"lift", "escalator", "overcrowding", "custom"}


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


# ---------------------------------------------------------------------------
# HTTP caching: ETag / 304 revalidation on the reference endpoints
# ---------------------------------------------------------------------------

# The unfiltered reference endpoints that carry an ETag and support conditional GET.
REFERENCE_PATHS = ["/stations", "/equipment-types", "/equipment"]


@pytest.mark.parametrize("path", REFERENCE_PATHS)
def test_reference_endpoint_sets_etag_and_cache_control(client: TestClient, path: str) -> None:
    response = client.get(path)

    assert response.status_code == 200
    assert response.headers.get("etag")
    assert "no-cache" in response.headers.get("cache-control", "")


@pytest.mark.parametrize("path", REFERENCE_PATHS)
def test_reference_endpoint_returns_304_when_etag_matches(client: TestClient, path: str) -> None:
    etag = client.get(path).headers["etag"]

    response = client.get(path, headers={"If-None-Match": etag})

    assert response.status_code == 304
    assert response.content == b""
    assert response.headers["etag"] == etag


@pytest.mark.parametrize("path", REFERENCE_PATHS)
def test_reference_endpoint_returns_200_when_etag_mismatches(client: TestClient, path: str) -> None:
    response = client.get(path, headers={"If-None-Match": 'W/"stale"'})

    assert response.status_code == 200
    assert response.json()


def test_equipment_filtered_request_is_not_conditional(
    client: TestClient, db_session: Session
) -> None:
    # Filtered (per-station) responses are not ETag-cached; a stale validator must not 304 them.
    station_id = db_session.query(Station).filter_by(name="Victoria").one().id

    response = client.get(
        f"/equipment?station_id={station_id}", headers={"If-None-Match": 'W/"stale"'}
    )

    assert response.status_code == 200
    assert all(e["station"]["name"] == "Victoria" for e in response.json())


# ---------------------------------------------------------------------------
# Weekly cache invalidation: the in-process cached_list is not permanent
# ---------------------------------------------------------------------------


def test_cached_list_recomputes_after_ttl(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.repositories import cache as cache_mod

    calls = {"n": 0}

    class Demo:
        @cache_mod.cached_list
        def items(self) -> list[int]:
            calls["n"] += 1
            return [calls["n"]]

    demo = Demo()
    assert demo.items() == [1]
    # Within the TTL the cached value is reused (no recompute).
    assert demo.items() == [1]
    assert calls["n"] == 1

    # Force every entry to be considered expired -> the next call recomputes.
    monkeypatch.setattr(cache_mod, "CACHE_TTL_SECONDS", -1)
    assert demo.items() == [2]
    assert calls["n"] == 2
