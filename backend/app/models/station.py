import enum

from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class StepFree(str, enum.Enum):
    """A station's step-free accessibility, as published by TfL.

    Ordered weakest-to-strongest: no step-free access, step-free from street to platform
    only, and step-free all the way from street onto the train.
    """

    NONE = "none"
    TO_PLATFORM = "to_platform"
    TO_VEHICLE = "to_vehicle"


class Station(Base):
    """A transit station that equipment (lifts, escalators, etc.) belongs to."""

    __tablename__ = "stations"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(unique=True)
    # Stored as a portable VARCHAR + CHECK (native_enum=False) using the lower-case values
    # ("none" / "to_platform" / "to_vehicle") rather than the enum member names.
    step_free: Mapped[StepFree] = mapped_column(
        SAEnum(StepFree, native_enum=False, values_callable=lambda e: [m.value for m in e]),
        default=StepFree.NONE,
    )
