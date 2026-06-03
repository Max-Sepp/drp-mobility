from pydantic import BaseModel, ConfigDict, field_validator

from app.models.platform import PlatformStepFree


class PlatformSchema(BaseModel):
    """Public representation of a Platform row, including its own step-free access."""

    model_config = ConfigDict(from_attributes=True)

    name: str
    step_free: PlatformStepFree
    lines: list[str]

    @field_validator("lines", mode="before")
    @classmethod
    def _line_names(cls, lines: list) -> list[str]:
        """Flatten the related Line rows to their names (the ORM yields Line objects)."""
        return [line.name if hasattr(line, "name") else line for line in lines]
