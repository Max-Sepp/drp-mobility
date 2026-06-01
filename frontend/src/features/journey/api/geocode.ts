// Resolves whatever the user typed (a free-text address, coordinates, or a postcode)
// down to a single UK postcode, so the journey planner can always query TfL
// postcode-to-postcode. Postcodes resolve uniquely on TfL, which avoids the "did you
// mean?" disambiguation that free text triggers.
//
// Pipeline for free text: Nominatim (address -> lat/lon) then postcodes.io
// (lat/lon -> nearest valid postcode). Both are key-less and called straight from the
// client. Coordinates skip Nominatim; an already-typed postcode skips both.

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org'
const POSTCODES_BASE = 'https://api.postcodes.io'

// UK postcode, with or without the internal space (e.g. "SW1A1AA" / "sw1a 1aa").
const POSTCODE_RE = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i
// "lat,long" decimal pair, e.g. "51.5074,-0.1278".
const COORD_RE = /^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/

/** A successfully resolved location: the postcode to query plus a label to show the user. */
export type ResolvedLocation = { postcode: string; label: string }
export type ResolveResult = ResolvedLocation | { error: string }

/** Normalise a postcode to upper-case with a single space before the final three chars. */
function normalisePostcode(raw: string): string {
  const compact = raw.replace(/\s+/g, '').toUpperCase()
  return `${compact.slice(0, -3)} ${compact.slice(-3)}`
}

/**
 * Nearest valid UK postcode to a coordinate, via postcodes.io reverse geocoding.
 * The default search radius is only 100m, which misses large sites (e.g. the centroid of
 * a park or palace grounds), so we widen it to the API's 2000m maximum.
 */
async function postcodeFromCoords(lat: number, lon: number): Promise<string | null> {
  const res = await fetch(`${POSTCODES_BASE}/postcodes?lon=${lon}&lat=${lat}&radius=2000&limit=1`)
  if (!res.ok) return null
  const body = await res.json().catch(() => null)
  return body?.result?.[0]?.postcode ?? null
}

/** Geocode a free-text address to a coordinate, restricted to Great Britain. */
async function coordsFromAddress(query: string): Promise<{ lat: number; lon: number } | null> {
  const url = `${NOMINATIM_BASE}/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&countrycodes=gb&limit=1`
  // Nominatim's usage policy requires an identifying User-Agent.
  const res = await fetch(url, { headers: { 'User-Agent': 'drp-mobility-app/1.0' } })
  if (!res.ok) return null
  const body = await res.json().catch(() => null)
  const first = Array.isArray(body) ? body[0] : null
  if (!first) return null
  return { lat: Number(first.lat), lon: Number(first.lon) }
}

/**
 * Resolve user input to a single UK postcode.
 * - A postcode is normalised and returned as-is.
 * - Coordinates are reverse-geocoded to the nearest postcode.
 * - Free text is geocoded (Nominatim) then reverse-geocoded (postcodes.io).
 */
export async function resolveToPostcode(input: string): Promise<ResolveResult> {
  const trimmed = input.trim()
  if (!trimmed) return { error: 'Please enter a location.' }

  if (POSTCODE_RE.test(trimmed)) {
    const postcode = normalisePostcode(trimmed)
    return { postcode, label: postcode }
  }

  let lat: number
  let lon: number
  const coordMatch = trimmed.match(COORD_RE)
  if (coordMatch) {
    lat = Number(coordMatch[1])
    lon = Number(coordMatch[2])
  } else {
    const coords = await coordsFromAddress(trimmed)
    if (!coords) {
      return { error: `Couldn’t find “${trimmed}”. Try a more specific address or a postcode.` }
    }
    lat = coords.lat
    lon = coords.lon
  }

  const postcode = await postcodeFromCoords(lat, lon)
  if (!postcode) {
    return { error: `Couldn’t find a UK postcode near “${trimmed}”. Try a postcode directly.` }
  }
  // Show the original text alongside the postcode we resolved it to.
  return { postcode, label: coordMatch ? postcode : `${trimmed} → ${postcode}` }
}
