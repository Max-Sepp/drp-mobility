import { MaterialIcons } from '@expo/vector-icons'
import { Text, XStack, YStack } from 'tamagui'
import { formatTime, isToday, parseUtc } from '@/lib/datetime'
import type {
  AssessedUnit,
  OutageAssessment,
  StationRole,
  UnitVerdict,
} from '../api/outageRelevance'

type VerdictStyle = {
  icon: keyof typeof MaterialIcons.glyphMap
  color: string
  background: string
  border: string
  label: string
}

// How sure we are the unit affects the route drives both the wording and the colour. We never
// use colour alone — each verdict carries an icon and a text label too.
const VERDICTS: Record<UnitVerdict, VerdictStyle> = {
  'on-your-platform': {
    icon: 'error',
    color: '#b91c1c',
    background: '#fef2f2',
    border: '#fecaca',
    label: 'On your route',
  },
  'shared-route': {
    icon: 'warning',
    color: '#92400e',
    background: '#fffbeb',
    border: '#fcd34d',
    label: 'On your path here',
  },
  'other-platform': {
    icon: 'info',
    color: '#374151',
    background: '#f9fafb',
    border: '#e5e7eb',
    label: 'Likely a different platform',
  },
  unknown: {
    icon: 'help-outline',
    color: '#374151',
    background: '#f9fafb',
    border: '#e5e7eb',
    label: 'Out of service',
  },
}

/** A one-line explanation of how the rider uses this station, when we can tell. */
function roleText(role: StationRole, lines: string[]): string | null {
  const service = lines.length > 0 ? ` (${lines.join(' / ')})` : ''
  switch (role) {
    case 'board':
      return `You board here${service}`
    case 'alight':
      return `You exit here${service}`
    case 'interchange':
      return `You change here${service}`
    default:
      return null
  }
}

/** "Reported 3× · last 14:20" / "· last 2 Jun". */
function reportMeta(unit: AssessedUnit): string {
  const count = `Reported ${unit.reportCount}×`
  if (!unit.lastReported) return count
  const d = parseUtc(unit.lastReported)
  const when = isToday(unit.lastReported)
    ? formatTime(unit.lastReported)
    : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  return `${count} · last ${when}`
}

/** The verdict's plain-language detail, tailored to the connection. */
function verdictDetail(unit: AssessedUnit): string {
  switch (unit.verdict) {
    case 'on-your-platform':
      return 'Serves a platform your service uses here.'
    case 'shared-route':
      return 'Connects areas you pass through here.'
    case 'other-platform':
      return "Serves a platform your route doesn't appear to use."
    default:
      return "Couldn't confirm whether this is on your route."
  }
}

/**
 * The accessibility-alert section of the journey detail screen: every flagged station, the rider's
 * role there, and each broken unit with a verdict on whether it actually affects this route.
 */
export const OutageDetail = ({ assessments }: { assessments: OutageAssessment[] }) => {
  if (assessments.length === 0) return null
  return (
    <YStack gap="$3">
      <Text fontSize={16} fontWeight="700" color="#111827">
        Accessibility alerts on this route
      </Text>
      {assessments.map((station) => {
        const role = roleText(station.role, station.journeyLines)
        return (
          <YStack
            key={station.stationName}
            gap="$2.5"
            p="$3"
            style={{ borderWidth: 1.5, borderColor: '#e5e7eb', borderRadius: 10 }}
          >
            <YStack gap="$0.5">
              <Text fontSize={15} fontWeight="700" color="#111827">
                {station.stationName}
              </Text>
              {role && (
                <Text fontSize={13} color="#6b7280">
                  {role}
                </Text>
              )}
            </YStack>

            {station.units.map((unit, i) => {
              const v = VERDICTS[unit.verdict]
              return (
                <YStack
                  key={i}
                  gap="$1.5"
                  p="$2.5"
                  style={{
                    backgroundColor: v.background,
                    borderWidth: 1,
                    borderColor: v.border,
                    borderRadius: 8,
                  }}
                >
                  <XStack gap="$2" items="center">
                    <MaterialIcons name={v.icon} size={16} color={v.color} />
                    <Text fontSize={13} fontWeight="700" flex={1} style={{ color: v.color }}>
                      {v.label}
                    </Text>
                  </XStack>
                  <Text fontSize={14} color="#111827">
                    {unit.connection}
                  </Text>
                  <Text fontSize={13} style={{ color: v.color }}>
                    {verdictDetail(unit)}
                  </Text>
                  <Text fontSize={12} color="#6b7280">
                    {reportMeta(unit)}
                    {unit.estimated ? ' · location estimated' : ''}
                  </Text>
                </YStack>
              )
            })}
          </YStack>
        )
      })}
    </YStack>
  )
}
