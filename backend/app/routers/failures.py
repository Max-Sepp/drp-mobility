from fastapi import APIRouter, Depends, HTTPException

from app.dependencies.auth import get_trusted_user
from app.events import broker, sse_event
from app.models.user import User
from app.repositories.failure import FailureRepository, get_failure_repo
from app.schemas.failure import (
    FailureDetail,
    FailureResolveRequest,
    FailureSummary,
    FailureVerifyRequest,
    OutageReportVerificationSchema,
)
from app.schemas.outage_report import OutageReportSummary

router = APIRouter(prefix="/failures", tags=["failures"])


def _failure_detail(repo: FailureRepository, failure) -> FailureDetail:
    """Build the FailureDetail response (equipment, active reports, verifications) for a failure."""
    reports = repo.list_active_reports(failure.id)
    return FailureDetail(
        id=failure.id,
        equipment=failure.equipment,
        resolved=failure.resolved,
        resolved_at=failure.resolved_at,
        resolution_description=failure.resolution_description,
        first_reported=min((r.breakdown_time for r in reports), default=None),
        reports=[OutageReportSummary.model_validate(r) for r in reports],
        verifications=repo.list_verifications(failure.id),
    )


@router.get("", response_model=list[FailureSummary])
def list_failures(repo: FailureRepository = Depends(get_failure_repo)) -> list[FailureSummary]:
    """Return all failures with computed first_reported and active report count."""
    return [
        FailureSummary(
            id=failure.id,
            equipment=failure.equipment,
            resolved=failure.resolved,
            first_reported=first_reported,
            last_reported=last_reported,
            report_count=report_count,
            verifications=failure.verifications,
        )
        for failure, first_reported, last_reported, report_count in repo.list_all_with_stats()
    ]


@router.get("/{failure_id}", response_model=FailureDetail)
def get_failure(
    failure_id: int,
    repo: FailureRepository = Depends(get_failure_repo),
) -> FailureDetail:
    """Return a single failure with its equipment details and active reports."""
    failure = repo.get(failure_id)
    if failure is None:
        raise HTTPException(status_code=404, detail="Failure not found")
    return _failure_detail(repo, failure)


@router.patch("/{failure_id}/resolve", response_model=FailureSummary)
def resolve_failure(
    failure_id: int,
    payload: FailureResolveRequest | None = None,
    repo: FailureRepository = Depends(get_failure_repo),
    _current_user: User = Depends(get_trusted_user),
) -> FailureSummary:
    """Mark a failure as resolved, with an optional reason. New reports for the same equipment will
    start a fresh failure."""
    failure = repo.get(failure_id)
    if failure is None:
        raise HTTPException(status_code=404, detail="Failure not found")
    failure = repo.resolve(failure, description=payload.description if payload else None)
    # Tell live clients this failure is resolved. Clients that have it loaded show the resolved
    # state (with the reason) rather than dropping it outright.
    broker.publish(
        sse_event(
            "resolved",
            {
                "failure_id": failure_id,
                "resolved_at": failure.resolved_at.isoformat() if failure.resolved_at else None,
                "description": failure.resolution_description,
            },
        )
    )
    reports = repo.list_active_reports(failure_id)
    times = [r.breakdown_time for r in reports]
    first_reported = min(times, default=None)
    last_reported = max(times, default=None)
    return FailureSummary(
        id=failure.id,
        equipment=failure.equipment,
        resolved=failure.resolved,
        resolved_at=failure.resolved_at,
        resolution_description=failure.resolution_description,
        first_reported=first_reported,
        last_reported=last_reported,
        report_count=len(reports),
        verifications=repo.list_verifications(failure_id),
    )


@router.patch("/{failure_id}/verify", response_model=FailureDetail)
def verify_failure(
    failure_id: int,
    payload: FailureVerifyRequest | None = None,
    repo: FailureRepository = Depends(get_failure_repo),
    _current_user: User = Depends(get_trusted_user),
) -> FailureDetail:
    """Record a trusted worker's on-site verification of this outage.

    Anonymised — only the time and an optional note are stored, never who verified. Not idempotent:
    each call appends a new verification, so an outage can accrue several over its lifetime. A
    failure counts as verified once it has at least one verification record.
    """
    failure = repo.get(failure_id)
    if failure is None:
        raise HTTPException(status_code=404, detail="Failure not found")
    repo.add_verification(failure, description=payload.description if payload else None)
    verifications = repo.list_verifications(failure_id)
    broker.publish(
        sse_event(
            "verified",
            {
                "failure_id": failure_id,
                "verifications": [
                    OutageReportVerificationSchema.model_validate(v).model_dump(mode="json")
                    for v in verifications
                ],
            },
        )
    )
    return _failure_detail(repo, failure)
