from datetime import datetime

from pydantic import BaseModel, ConfigDict, computed_field

from app.schemas.equipment import EquipmentSummary


class FailureVerifyRequest(BaseModel):
    """Request body for PATCH /failures/{id}/verify — an optional on-site note."""

    description: str | None = None


class FailureResolveRequest(BaseModel):
    """Request body for PATCH /failures/{id}/resolve — an optional reason for resolving."""

    description: str | None = None


class OutageReportVerificationSchema(BaseModel):
    """One on-site verification of a failure: when it happened and an optional note. Anonymised —
    no actor is recorded."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    verified_at: datetime
    description: str | None = None


class FailureInline(BaseModel):
    """Minimal failure info embedded inside an OutageReportSummary."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    equipment: EquipmentSummary
    resolved: bool
    resolved_at: datetime | None = None
    resolution_description: str | None = None
    verifications: list[OutageReportVerificationSchema] = []

    @computed_field
    @property
    def verified(self) -> bool:
        """A failure is verified once at least one verification record exists."""
        return len(self.verifications) > 0


class FailureSummary(BaseModel):
    """Failure as returned by GET /failures (with computed aggregates)."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    equipment: EquipmentSummary
    resolved: bool
    resolved_at: datetime | None = None
    resolution_description: str | None = None
    first_reported: datetime | None
    last_reported: datetime | None
    report_count: int
    verifications: list[OutageReportVerificationSchema] = []
    station_total_same_type_count: int = 1

    @computed_field
    @property
    def verified(self) -> bool:
        return len(self.verifications) > 0


class FailureDetail(BaseModel):
    """Failure as returned by GET /failures/{id} (with active reports)."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    equipment: EquipmentSummary
    resolved: bool
    resolved_at: datetime | None = None
    resolution_description: str | None = None
    first_reported: datetime | None
    reports: list["OutageReportSummary"]
    verifications: list[OutageReportVerificationSchema] = []

    @computed_field
    @property
    def verified(self) -> bool:
        return len(self.verifications) > 0
