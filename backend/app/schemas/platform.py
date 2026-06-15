from pydantic import AliasChoices, BaseModel, ConfigDict, Field, field_validator

from app.models.platform import PlatformStepFree


class InterchangeToSchema(BaseModel):
    """A step-free walking link from one platform to another at the same station."""

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    # The destination platform's name (matches another platform's `name` at this station).
    to: str
    # Step-free walking distance in metres. Stored in stations.json under the `distanceM` key.
    distance_m: int = Field(validation_alias=AliasChoices("distanceM", "distance_m"))


class PlatformSchema(BaseModel):
    """Public representation of a Platform row, including its own step-free access."""

    model_config = ConfigDict(from_attributes=True)

    name: str
    step_free: PlatformStepFree
    lines: list[str]
    # Direction of travel from this platform (e.g. "Eastbound"); null when unknown.
    direction: str | None = None
    # Step-free links to other platforms at the same station; null when none are documented.
    interchange_to: list[InterchangeToSchema] | None = None
    # Names of other platforms reachable from this one at the same level (lift-independent);
    # null when none are documented. This is the set a rider stranded by a broken lift can
    # still walk to, so the stuck-on-platform reroute reasons over this rather than
    # `interchange_to`.
    same_level_platforms: list[str] | None = None

    @field_validator("lines", mode="before")
    @classmethod
    def _line_names(cls, lines: list) -> list[str]:
        """Flatten the related Line rows to their names (the ORM yields Line objects)."""
        return [line.name if hasattr(line, "name") else line for line in lines]
