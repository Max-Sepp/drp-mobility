from pydantic import BaseModel


class SavedPlaceSchema(BaseModel):
    address: str
    postcode: str


class CustomPlaceSchema(BaseModel):
    id: str
    name: str
    icon: str
    address: str
    postcode: str


class SavedPlacesIn(BaseModel):
    home: SavedPlaceSchema | None = None
    work: SavedPlaceSchema | None = None
    custom: list[CustomPlaceSchema] = []


class SavedPlacesOut(BaseModel):
    home: SavedPlaceSchema | None = None
    work: SavedPlaceSchema | None = None
    custom: list[CustomPlaceSchema] = []
