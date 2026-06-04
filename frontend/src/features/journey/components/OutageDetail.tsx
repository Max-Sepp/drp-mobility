import { MaterialIcons } from '@expo/vector-icons'
import { Text, XStack, YStack } from 'tamagui'
import { formatTime, isToday, parseUtc } from '@/lib/datetime'
import type {
  AssessedUnit,
  OutageAssessment,
  StationRole,
  UnitVerdict,
} from '@/features/journey/api/outageRelevance'
import { Borders, Colors, Radii } from '@/theme'

type VerdictStyle = {
  icon: keyof typeof MaterialIcons.glyphMap
  color: string
  background: string
  border: string
  label: string
}

const VERDICTS: Record<UnitVerdict, VerdictStyle> = {
  'on-your-platform': {
    icon: 'error',
    color: Colors.dangerDark,
    background: Colors.dangerBg,
    border: Colors.dangerBorder,
    label: 'On your route',
  },
  'shared-route': {
    icon: 'warning',
    color: Colors.warningDark,
    background: Colors.warningBg,
    border: Colors.warningBorder,
    label: 'On your path here',
  },
  'other-platform': {
    icon: 'info',
    color: Colors.text,
    background: Colors.searchBg,
    border: Colors.border,
    label: 'Likely a different platform',
  },
  unknown: {
    icon: 'help-outline',
    color: Colors.text,
    background: Colors.searchBg,
    border: Colors.border,
    label: 'Out of service',
  },
}

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

function reportMeta(unit: AssessedUnit): string {
  const count = `Reported ${unit.reportCount}×`
  if (!unit.lastReported) return count
  const d = parseUtc(unit.lastReported)
  const when = isToday(unit.lastReported)
    ? formatTime(unit.lastReported)
    : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  return `${count} · last ${when}`
}

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

export const OutageDetail = ({ assessments }: { assessments: OutageAssessment[] }) => {
  if (assessments.length === 0) return null
  return (
    <YStack gap="$3">
      <Text fontSize={16} fontWeight="700" color={Colors.text}>
        Accessibility alerts on this route
      </Text>
      {assessments.map((station) => {
        const role = roleText(station.role, station.journeyLines)
        return (
          <YStack
            key={station.stationName}
            gap="$2.5"
            p="$3"
            style={{
              borderWidth: Borders.medium,
              borderColor: Colors.border,
              borderRadius: Radii.button,
            }}
          >
            <YStack gap="$0.5">
              <Text fontSize={15} fontWeight="700" color={Colors.text}>
                {station.stationName}
              </Text>
              {role && (
                <Text fontSize={13} color={Colors.secondaryText}>
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
                    borderWidth: Borders.thin,
                    borderColor: v.border,
                    borderRadius: Radii.small,
                  }}
                >
                  <XStack gap="$2" items="center">
                    <MaterialIcons name={v.icon} size={16} color={v.color} />
                    <Text fontSize={13} fontWeight="700" flex={1} style={{ color: v.color }}>
                      {v.label}
                    </Text>
                  </XStack>
                  <Text fontSize={14} color={Colors.text}>
                    {unit.connection}
                  </Text>
                  <Text fontSize={13} style={{ color: v.color }}>
                    {verdictDetail(unit)}
                  </Text>
                  <Text fontSize={12} color={Colors.secondaryText}>
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
