import os

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from fastapi.responses import Response

from app.repositories.outage_report import OutageReportRepository, get_repo
from app.schemas.outage_report import OutageReportCreate, OutageReportSummary

router = APIRouter(prefix="/outage-reports", tags=["outage-reports"])

_ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}

_EXT_TO_MIME = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
}


def _resolve_content_type(file: UploadFile) -> str:
    """Return the MIME type for *file*, falling back to filename extension."""
    ct = (file.content_type or "").lower().split(";")[0].strip()
    if ct in _ALLOWED_IMAGE_TYPES:
        return ct
    # React Native FormData sometimes omits or sends a generic content-type;
    # fall back to the filename extension so uploads still work.
    if file.filename:
        ext = os.path.splitext(file.filename)[1].lower()
        inferred = _EXT_TO_MIME.get(ext, "")
        if inferred:
            return inferred
    return ct


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------


@router.post("", response_model=OutageReportSummary, status_code=201)
def create_outage_report(
    payload: OutageReportCreate,
    repo: OutageReportRepository = Depends(get_repo),
) -> OutageReportSummary:
    """Submit a new outage report (without an image).

    To attach an image, follow up with POST /outage-reports/{id}/image.
    """
    try:
        return repo.create(payload)
    except ValueError as exc:
        # 422 Unprocessable Entity: payload parsed fine, but a referenced row
        # (e.g. equipment_id) doesn't exist — semantically invalid input.
        raise HTTPException(status_code=422, detail=str(exc))


@router.get("", response_model=list[OutageReportSummary])
def list_outage_reports(
    repo: OutageReportRepository = Depends(get_repo),
) -> list[OutageReportSummary]:
    """Return all outage reports (newest first)."""
    return repo.list_all()


@router.get("/{report_id}", response_model=OutageReportSummary)
def get_outage_report(
    report_id: int,
    repo: OutageReportRepository = Depends(get_repo),
) -> OutageReportSummary:
    """Return a single outage report by ID."""
    report = repo.get_active(report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Outage report not found")
    return report


@router.delete("/{report_id}", status_code=204)
def delete_outage_report(
    report_id: int,
    reason: str | None = None,
    repo: OutageReportRepository = Depends(get_repo),
) -> None:
    """Soft-delete an outage report (creates a deletion record, row is kept)."""
    report = repo.get(report_id)
    if report is None or repo.is_deleted(report_id):
        raise HTTPException(status_code=404, detail="Outage report not found")
    repo.soft_delete(report, reason=reason)


# ---------------------------------------------------------------------------
# Image upload / download
# ---------------------------------------------------------------------------


@router.post("/{report_id}/image", response_model=OutageReportSummary)
async def upload_image(
    report_id: int,
    file: UploadFile,
    repo: OutageReportRepository = Depends(get_repo),
) -> OutageReportSummary:
    """Attach (or replace) an image for an existing outage report.

    Accepted content types: JPEG, PNG, WebP, GIF.
    """
    report = repo.get_active(report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Outage report not found")

    content_type = _resolve_content_type(file)
    if content_type not in _ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported image type '{content_type}'. "
            f"Allowed: {', '.join(sorted(_ALLOWED_IMAGE_TYPES))}",
        )

    return repo.set_image(report, await file.read(), content_type)


@router.get("/{report_id}/image")
def download_image(
    report_id: int,
    repo: OutageReportRepository = Depends(get_repo),
) -> Response:
    """Download the raw image attached to an outage report."""
    report = repo.get_active(report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Outage report not found")
    if report.image is None:
        raise HTTPException(
            status_code=404, detail="No image attached to this outage report"
        )
    return Response(content=report.image, media_type=report.image_content_type)
