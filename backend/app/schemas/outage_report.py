from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.schemas.failure import FailureDetail, FailureInline


class OutageReportCreate(BaseModel):
    """Request body for POST /outage-reports — the image is uploaded separately."""

    equipment_id: int
    breakdown_time: datetime
    description: str | None = None


class OutageReportSummary(BaseModel):
    """Outage report as returned to clients; `image_content_type` indicates an image is available
    via GET /outage-reports/{id}/image — the bytes themselves are never embedded in JSON."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    failure_id: int
    failure: FailureInline
    breakdown_time: datetime
    description: str | None = None
    image_content_type: str | None = None


# FailureDetail.reports references OutageReportSummary by string; resolve it now.
FailureDetail.model_rebuild()
