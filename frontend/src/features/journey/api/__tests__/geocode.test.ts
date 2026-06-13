import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { hubToStopPoint, tflQuery, type ResolvedLocation } from '@/features/journey/api/geocode'

describe('tflQuery', () => {
  const base = { postcode: 'SE2 9RH', label: 'Abbey Wood' }

  it('uses the postcode when there is no TfL id', async () => {
    await expect(tflQuery(base)).resolves.toBe('SE2 9RH')
  })

  it('prefers a tube/DLR StopPoint id over the postcode', async () => {
    const loc: ResolvedLocation = { ...base, tflId: '940GZZLUACT' }
    await expect(tflQuery(loc)).resolves.toBe('940GZZLUACT')
  })

  it('prefers a national-rail StopPoint id over the postcode', async () => {
    const loc: ResolvedLocation = { ...base, tflId: '910GACTONML' }
    await expect(tflQuery(loc)).resolves.toBe('910GACTONML')
  })
})

describe('hub resolution', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const stubFetch = (impl: () => Promise<Partial<Response>>) =>
    vi.stubGlobal('fetch', vi.fn(impl) as unknown as typeof fetch)

  // HUBVIC (Victoria) groups a bus station, a rail station and a tube station; we want the
  // journey to end at a real platform StopPoint, never the bus stop or a nearby postcode.
  it('resolves a hub code to its tube StopPoint, preferring rail/tube over bus', async () => {
    stubFetch(async () => ({
      ok: true,
      json: async () => ({
        children: [
          { naptanId: '490G000812', stopType: 'NaptanBusCoachStation' },
          { naptanId: '910GVICTRIC', stopType: 'NaptanRailStation' },
          { naptanId: '940GZZLUVIC', stopType: 'NaptanMetroStation' },
        ],
      }),
    }))
    await expect(hubToStopPoint('HUBVIC')).resolves.toBe('940GZZLUVIC')

    const loc: ResolvedLocation = { postcode: 'SW1V 1JU', label: 'Victoria', tflId: 'HUBVIC' }
    await expect(tflQuery(loc)).resolves.toBe('940GZZLUVIC')
  })

  it('falls back to the postcode when the hub lookup fails', async () => {
    stubFetch(async () => {
      throw new Error('offline')
    })
    const loc: ResolvedLocation = { postcode: 'SE2 9RH', label: 'Abbey Wood', tflId: 'HUBNOPE' }
    await expect(tflQuery(loc)).resolves.toBe('SE2 9RH')
  })
})
