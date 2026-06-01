from pydantic import BaseModel, ConfigDict


class EquipmentTypeSchema(BaseModel):
    """Public representation of an EquipmentType row (e.g. "lift", "escalator")."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
