from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.schemas.equipment import EquipmentSummary


class FailureInline(BaseModel):
    """Minimal failure info embedded inside an OutageReportSummary."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    equipment: EquipmentSummary
    resolved: bool


class FailureSummary(BaseModel):
    """Failure as returned by GET /failures (with computed aggregates)."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    equipment: EquipmentSummary
    resolved: bool
    first_reported: datetime | None
    last_reported: datetime | None
    report_count: int


class FailureDetail(BaseModel):
    """Failure as returned by GET /failures/{id} (with active reports)."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    equipment: EquipmentSummary
    resolved: bool
    first_reported: datetime | None
    reports: list["OutageReportSummary"]
