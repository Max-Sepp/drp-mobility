"""Station-name normalisation shared by the push-notification matcher and the TfL poller.

Mirrors the frontend's ``normaliseStationName``
(frontend/src/features/journey/api/accessibility.ts): lower-case, strip apostrophes/dots,
strip a trailing "… station" suffix, collapse whitespace. This lets our terse station names
("King's Cross") match TfL's verbose values ("King's Cross St. Pancras Underground Station")
via substring containment.
"""

import re

_STATION_SUFFIX_RE = re.compile(
    r"\s+(?:underground|overground|rail|dlr|bus|elizabeth\s+line)?\s*station$",
    re.IGNORECASE,
)


def normalise_station_name(name: str) -> str:
    """Return a comparison-friendly form of a station name."""
    name = name.lower().replace("'", "").replace(".", "")
    name = _STATION_SUFFIX_RE.sub("", name)
    return re.sub(r"\s+", " ", name).strip()
