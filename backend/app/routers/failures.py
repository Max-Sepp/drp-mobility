from fastapi import APIRouter, Depends, HTTPException

from app.repositories.failure import FailureRepository, get_failure_repo
from app.schemas.failure import FailureDetail, FailureSummary
from app.schemas.outage_report import OutageReportSummary

router = APIRouter(prefix="/failures", tags=["failures"])


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
    reports = repo.list_active_reports(failure_id)
    first_reported = min((r.breakdown_time for r in reports), default=None)
    return FailureDetail(
        id=failure.id,
        equipment=failure.equipment,
        resolved=failure.resolved,
        first_reported=first_reported,
        reports=[OutageReportSummary.model_validate(r) for r in reports],
    )


@router.patch("/{failure_id}/resolve", response_model=FailureSummary)
def resolve_failure(
    failure_id: int,
    repo: FailureRepository = Depends(get_failure_repo),
) -> FailureSummary:
    """Mark a failure as resolved. New reports for the same equipment will start a fresh failure."""
    failure = repo.get(failure_id)
    if failure is None:
        raise HTTPException(status_code=404, detail="Failure not found")
    failure = repo.resolve(failure)
    reports = repo.list_active_reports(failure_id)
    times = [r.breakdown_time for r in reports]
    first_reported = min(times, default=None)
    last_reported = max(times, default=None)
    return FailureSummary(
        id=failure.id,
        equipment=failure.equipment,
        resolved=failure.resolved,
        first_reported=first_reported,
        last_reported=last_reported,
        report_count=len(reports),
    )
