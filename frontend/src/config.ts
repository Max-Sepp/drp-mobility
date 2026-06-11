/**
 * How long TfL journey-planner results are treated as fresh before a re-fetch is triggered.
 * Used by the rerouting cache in ActiveJourneySheet and the journey planner results in
 * JourneyPlannerSheet (if it ever adds TTL-based invalidation).
 */
export const JOURNEY_CACHE_TTL_MS = 5 * 60 * 1000
