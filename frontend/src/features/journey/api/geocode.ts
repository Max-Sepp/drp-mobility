// Resolves whatever the user typed (a free-text address, coordinates, or a postcode)
// down to a single UK postcode, so the journey planner can always query TfL
// postcode-to-postcode. Postcodes resolve uniquely on TfL, which avoids the "did you
// mean?" disambiguation that free text triggers.
//
// Pipeline for free text: Mapbox Geocoding v5 (address -> lat/lon) then postcodes.io
// (lat/lon -> nearest valid postcode). Coordinates skip Mapbox; an already-typed
// postcode skips both.

const MAPBOX_BASE = 'https://api.mapbox.com/geocoding/v5/mapbox.places'
const POSTCODES_BASE = 'https://api.postcodes.io'
const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? ''

// London bounding box [west, south, east, north] — used for autocomplete only.
const LONDON_BBOX = '-0.510375,51.286760,0.334015,51.691874'
// Central London proximity bias [lon, lat].
const LONDON_CENTRE = '-0.1278,51.5074'

// UK postcode, with or without the internal space (e.g. "SW1A1AA" / "sw1a 1aa").
const POSTCODE_RE = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i
// "lat,long" decimal pair, e.g. "51.5074,-0.1278".
const COORD_RE = /^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/

/** A successfully resolved location: the postcode to query plus a label to show the user. */
export type ResolvedLocation = { postcode: string; label: string }
export type ResolveResult = ResolvedLocation | { error: string }

/** A candidate place for the address autocomplete dropdown. */
export type LocationSuggestion = { label: string; lat: number; lon: number; postcode?: string }

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

/** Extract a UK postcode from a Mapbox feature's context array, if present. */
function postcodeFromContext(
  context: Array<{ id: string; text: string }> = [],
): string | undefined {
  return context.find((c) => c.id.startsWith('postcode.'))?.text
}

/**
 * Geocode a free-text address to a coordinate via Mapbox.
 * No bbox restriction here so addresses outside London (Surrey, Essex, etc.) still resolve
 * when the user types them manually into the journey planner and hits Plan.
 */
async function coordsFromAddress(query: string): Promise<{ lat: number; lon: number } | null> {
  const url =
    `${MAPBOX_BASE}/${encodeURIComponent(query)}.json` +
    `?access_token=${MAPBOX_TOKEN}&country=gb&limit=1`
  const res = await fetch(url)
  if (!res.ok) return null
  const body = await res.json().catch(() => null)
  const feature = body?.features?.[0]
  if (!feature) return null
  const [lon, lat] = feature.center as [number, number]
  return { lat, lon }
}

/**
 * Address autocomplete: up to five candidate places biased to Greater London, for a
 * free-text query to populate a selection dropdown. Returns nothing for very short queries
 * or input that is already a postcode/coordinate (those need no lookup).
 */
export async function searchLocations(query: string): Promise<LocationSuggestion[]> {
  const q = query.trim()
  if (q.length < 3 || POSTCODE_RE.test(q) || COORD_RE.test(q)) return []
  const url =
    `${MAPBOX_BASE}/${encodeURIComponent(q)}.json` +
    `?access_token=${MAPBOX_TOKEN}&country=gb` +
    `&bbox=${LONDON_BBOX}&proximity=${LONDON_CENTRE}&autocomplete=true&limit=5`
  const res = await fetch(url)
  if (!res.ok) return []
  const body = await res.json().catch(() => null)
  if (!Array.isArray(body?.features)) return []
  return body.features.map((f: { place_name: string; center: [number, number]; context?: Array<{ id: string; text: string }> }) => ({
    label: f.place_name.replace(/, United Kingdom$/, ''),
    lat: f.center[1],
    lon: f.center[0],
    postcode: postcodeFromContext(f.context),
  }))
}

/**
 * The postcode for a chosen suggestion: use Mapbox's own postcode when it gave one,
 * otherwise reverse-geocode its coordinates.
 */
export async function postcodeForSuggestion(
  suggestion: LocationSuggestion,
): Promise<string | null> {
  if (suggestion.postcode && POSTCODE_RE.test(suggestion.postcode)) {
    return normalisePostcode(suggestion.postcode)
  }
  return postcodeFromCoords(suggestion.lat, suggestion.lon)
}

/**
 * Resolve user input to a single UK postcode.
 * - A postcode is normalised and returned as-is.
 * - Coordinates are reverse-geocoded to the nearest postcode.
 * - Free text is geocoded (Mapbox) then reverse-geocoded (postcodes.io).
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
      return { error: `Couldn't find "${trimmed}". Try a more specific address or a postcode.` }
    }
    lat = coords.lat
    lon = coords.lon
  }

  const postcode = await postcodeFromCoords(lat, lon)
  if (!postcode) {
    return { error: `Couldn't find a UK postcode near "${trimmed}". Try a postcode directly.` }
  }
  // Keep the readable place the user typed as the label (the postcode is used only to query
  // TfL); coordinates have no readable form, so fall back to the postcode there.
  return { postcode, label: coordMatch ? postcode : trimmed }
}
