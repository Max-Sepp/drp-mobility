// Multi-step reporting sheet that slides up over the station sheet.
// Step 1 ('type'): issue type grid — 55% snap
// Step 2 ('form'): equipment picker + comments + photo — 88% snap
// Step 3 ('success'): confirmation card, then closes

import * as ImagePicker from 'expo-image-picker'
import { MaterialIcons } from '@expo/vector-icons'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Dimensions, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native'
import { Text } from 'tamagui'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import BottomSheet, { BottomSheetScrollView, type BottomSheetRef } from '@/components/BottomSheet'
import { SheetHeader } from '@/components/SheetHeader'
import { apiClient } from '@/api/client'
import type { components } from '@/api/schema.d'
import { loadActiveJourney, type ActiveJourney } from '@/features/journey/api/activeJourney'
import {
  isEquipmentOnJourney,
  journeyPlatformsAtStation,
} from '@/features/journey/api/journeyLifts'
import { useStations } from '@/features/stations'
import { useEquipment } from '@/features/reporting/useEquipment'
import { EquipmentPicker } from '@/features/reporting/components/EquipmentPicker'
import { FormSection } from '@/features/reporting/components/FormSection'
import { PhotoPicker } from '@/features/reporting/components/PhotoPicker'
import { useTheme, Borders, Heights, Spacing } from '@/theme'

type Equipment = components['schemas']['EquipmentSummary']
type Step = 'type' | 'form' | 'success'
type IssueType = 'lift' | 'escalator' | 'overcrowding' | 'custom'

const SCREEN_H = Dimensions.get('window').height
const TOP_BUTTON_RESERVE = 66

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

const ISSUE_TYPES: { type: IssueType; icon: keyof typeof MaterialIcons.glyphMap; label: string }[] =
  [
    { type: 'lift', icon: 'elevator', label: 'Lift\nBroken' },
    { type: 'escalator', icon: 'escalator', label: 'Escalator\nBroken' },
    { type: 'overcrowding', icon: 'groups', label: 'Overcrowding' },
    { type: 'custom', icon: 'edit-note', label: 'Custom\nIssue' },
  ]

type Props = {
  station: string | null
  onClose: () => void
  onHeightChange?: (height: number) => void
}

export function ReportSheet({ station, onClose, onHeightChange }: Props) {
  const { Colors, Radii, Shadows } = useTheme()
  const styles = useMemo(
    () =>
      StyleSheet.create({
        iconBtn: {
          width: 32,
          height: 32,
          borderRadius: Radii.circle,
          backgroundColor: Colors.searchBg,
          alignItems: 'center',
          justifyContent: 'center',
          marginTop: 2,
        },
        gridContainer: {
          paddingHorizontal: Spacing.lg,
          paddingTop: Spacing.sm,
        },
        grid: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: Spacing.md,
          justifyContent: 'space-between',
        },
        gridItem: {
          width: '47%',
          aspectRatio: 1.3,
          borderWidth: Borders.thin,
          borderColor: Colors.border,
          borderRadius: Radii.button,
          backgroundColor: Colors.card,
          alignItems: 'center',
          justifyContent: 'center',
          ...Shadows.card,
        },
        textArea: {
          borderWidth: Borders.thin,
          borderColor: Colors.border,
          borderRadius: Radii.input,
          backgroundColor: Colors.searchBg,
          color: Colors.text,
          fontSize: 15,
          paddingHorizontal: Spacing.md,
          paddingVertical: Spacing.sm,
          minHeight: 80,
          textAlignVertical: 'top',
        },
        textInput: {
          borderWidth: Borders.thin,
          borderColor: Colors.border,
          borderRadius: Radii.input,
          backgroundColor: Colors.searchBg,
          color: Colors.text,
          fontSize: 15,
          paddingHorizontal: Spacing.md,
          paddingVertical: Spacing.sm,
          height: 44,
        },
        submitRow: {
          paddingHorizontal: Spacing.lg,
          marginTop: Spacing.xl,
        },
        submitBtn: {
          height: Heights.button,
          borderRadius: Radii.button,
          backgroundColor: Colors.blue,
          alignItems: 'center',
          justifyContent: 'center',
          ...Shadows.card,
        },
        successContainer: {
          alignItems: 'center',
          paddingHorizontal: Spacing.xl,
          paddingTop: Spacing.xxl,
        },
        successCircle: {
          width: 110,
          height: 110,
          borderRadius: Radii.circle,
          borderWidth: 3,
          borderColor: Colors.successDark,
          backgroundColor: Colors.successBg,
          alignItems: 'center',
          justifyContent: 'center',
        },
        okBtn: {
          marginTop: Spacing.xl,
          paddingVertical: Spacing.md,
          paddingHorizontal: Spacing.xxl,
          borderRadius: Radii.pill,
          borderWidth: Borders.thin,
          borderColor: Colors.border,
          backgroundColor: Colors.searchBg,
        },
      }),
    [Colors, Radii, Shadows],
  )
  const insets = useSafeAreaInsets()
  const snapPoints = useMemo(
    () => [SCREEN_H * 0.55, SCREEN_H - insets.top - TOP_BUTTON_RESERVE],
    [insets.top],
  )
  const sheetRef = useRef<BottomSheetRef>(null)

  const [step, setStep] = useState<Step>('type')
  const [issueType, setIssueType] = useState<IssueType | null>(null)
  const [equipmentId, setEquipmentId] = useState<number | null>(null)
  const [description, setDescription] = useState('')
  const [area, setArea] = useState('')
  const [photo, setPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null)
  const [submitting, setSubmitting] = useState(false)
  // The in-progress journey (if any), used to surface the equipment on the rider's current route
  // first. Null when no journey is underway — the list keeps its plain alphabetical order.
  const [activeJourney, setActiveJourney] = useState<ActiveJourney | null>(null)
  const { stations } = useStations()
  // The full equipment list is cached/revalidated reference data; filter it client-side rather
  // than refetching it over the network each time the sheet opens.
  const {
    equipment: allEquipment,
    loading: equipmentLoading,
    error: equipmentError,
  } = useEquipment()

  const stationEquipment = useMemo(
    () => (station ? allEquipment.filter((e) => e.station.name === station) : []),
    [allEquipment, station],
  )
  // `undefined` until the list is known, so the issue tiles stay enabled (not wrongly disabled)
  // while the list is loading or after a fetch failure.
  const equipmentReady = !equipmentLoading && !equipmentError
  const hasLifts = equipmentReady
    ? stationEquipment.some((e) => e.equipment_type.name === 'lift')
    : undefined
  const hasEscalators = equipmentReady
    ? stationEquipment.some((e) => e.equipment_type.name === 'escalator')
    : undefined

  // The pickable rows for the chosen lift/escalator issue, alphabetised (numeric-aware).
  const equipment = useMemo<Equipment[]>(() => {
    if (issueType !== 'lift' && issueType !== 'escalator') return []
    return stationEquipment
      .filter((e) => e.equipment_type.name === issueType)
      .sort((a, b) => a.connection.localeCompare(b.connection, undefined, { numeric: true }))
  }, [stationEquipment, issueType])

  function resetForm() {
    setIssueType(null)
    setEquipmentId(null)
    setDescription('')
    setArea('')
    setPhoto(null)
    setSubmitting(false)
  }

  useEffect(() => {
    if (station) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      resetForm()
      setStep('type')
      // Equipment availability comes from the cached list (see hasLifts/hasEscalators), so the
      // sheet opens immediately instead of waiting on a network round-trip.
      sheetRef.current?.snapToIndex(0)
    } else {
      sheetRef.current?.close()
    }
  }, [station])

  // For overcrowding/custom there's a single station-level equipment row; auto-select it once the
  // (possibly still-loading) cached equipment list is available.
  useEffect(() => {
    if ((issueType === 'overcrowding' || issueType === 'custom') && equipmentId == null) {
      const equip = stationEquipment.find((e) => e.equipment_type.name === issueType)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (equip) setEquipmentId(equip.id)
    }
  }, [issueType, equipmentId, stationEquipment])

  // Re-check for an in-progress journey each time the sheet opens for a station (one may have
  // started since last open).
  useEffect(() => {
    if (!station) return
    let active = true
    loadActiveJourney().then((journey) => {
      if (active) setActiveJourney(journey)
    })
    return () => {
      active = false
    }
  }, [station])

  const stationDetail = useMemo(() => stations.find((s) => s.name === station), [stations, station])

  // Ids of the equipment connecting to a platform on the line the rider is using at this station,
  // for the current journey. Empty unless a journey is underway and passes through here.
  const highlightedIds = useMemo(() => {
    if (issueType !== 'lift' && issueType !== 'escalator') return new Set<number>()
    if (!activeJourney || !stationDetail || !station) return new Set<number>()
    const relevant = journeyPlatformsAtStation(
      activeJourney.journey,
      station,
      stationDetail.platforms,
    )
    if (relevant.onJourney.size === 0) return new Set<number>()
    return new Set(
      equipment.filter((e) => isEquipmentOnJourney(e.connection, relevant)).map((e) => e.id),
    )
  }, [activeJourney, stationDetail, station, equipment, issueType])

  // Surface the on-route equipment first while preserving the alphabetical order within each group
  // (Array.prototype.sort is stable). No reordering when nothing is highlighted.
  const orderedEquipment = useMemo(() => {
    if (highlightedIds.size === 0) return equipment
    return [...equipment].sort(
      (a, b) => Number(highlightedIds.has(b.id)) - Number(highlightedIds.has(a.id)),
    )
  }, [equipment, highlightedIds])

  function handleChange(index: number) {
    onHeightChange?.(index >= 0 ? snapPoints[index] : 0)
    if (index === -1) onClose()
  }

  function isTypeDisabled(type: IssueType): boolean {
    if (type === 'lift') return hasLifts === false
    if (type === 'escalator') return hasEscalators === false
    return false
  }

  function selectType(type: IssueType) {
    setIssueType(type)
    setEquipmentId(null)
    setDescription('')
    setPhoto(null)
    setStep('form')
    sheetRef.current?.snapToIndex(1)
    // The lift/escalator list (`equipment`) and the overcrowding/custom auto-select are both
    // derived from the cached equipment list — no network call needed here.
  }

  function goBack() {
    setStep('type')
    sheetRef.current?.snapToIndex(0)
  }

  async function submit() {
    if (!station) return

    if (!equipmentId) {
      Alert.alert('Required', `Please select which ${issueType} is broken.`)
      return
    }

    if (photo) {
      const mimeType = photo.mimeType ?? ''
      if (!ALLOWED_MIME.has(mimeType)) {
        Alert.alert(
          'Unsupported image',
          `Please choose a JPEG, PNG, WebP, or GIF. (Detected: ${mimeType || 'unknown'})`,
        )
        return
      }
    }

    setSubmitting(true)
    try {
      const descParts = [description.trim(), area.trim() ? `Area: ${area.trim()}` : ''].filter(
        Boolean,
      )
      const { data, error } = await apiClient.POST('/outage-reports', {
        body: {
          equipment_id: equipmentId,
          breakdown_time: new Date().toISOString(),
          description: descParts.join('\n') || null,
        },
      })
      if (error || !data) {
        Alert.alert('Error', 'Failed to submit report. Please try again.')
        setSubmitting(false)
        return
      }
      if (photo) {
        const mimeType = photo.mimeType!
        const formData = new FormData()
        formData.append('file', {
          uri: photo.uri,
          type: mimeType,
          name: mimeType === 'image/png' ? 'photo.png' : 'photo.jpg',
        } as unknown as Blob)
        await apiClient.POST('/outage-reports/{report_id}/image', {
          params: { path: { report_id: data.id } },
          body: formData as unknown as never,
        })
      }
      setStep('success')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong. Please try again.'
      Alert.alert('Error', msg)
      setSubmitting(false)
    }
  }

  const formTitle =
    issueType === 'lift'
      ? 'Report a broken lift'
      : issueType === 'escalator'
        ? 'Report a broken escalator'
        : issueType === 'overcrowding'
          ? 'Report overcrowding'
          : 'Describe the issue'

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={snapPoints}
      enablePanDownToClose
      onChange={handleChange}
    >
      {step === 'type' && (
        <>
          <SheetHeader
            title="Report issue"
            subtitle={station ? `@ ${station}` : undefined}
            onClose={() => sheetRef.current?.close()}
          />

          <BottomSheetScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[
              styles.gridContainer,
              { paddingBottom: insets.bottom + Spacing.xl },
            ]}
          >
            <View style={styles.grid}>
              {ISSUE_TYPES.filter(({ type }) => !isTypeDisabled(type)).map(
                ({ type, icon, label }) => (
                  <TouchableOpacity
                    key={type}
                    style={styles.gridItem}
                    onPress={() => selectType(type)}
                    activeOpacity={0.75}
                    accessibilityRole="button"
                    accessibilityLabel={label.replace('\n', ' ')}
                  >
                    <MaterialIcons name={icon} size={36} color={Colors.text} />
                    <Text
                      fontSize={14}
                      fontWeight="600"
                      color={Colors.text}
                      mt="$1.5"
                      style={{ textAlign: 'center' }}
                    >
                      {label}
                    </Text>
                  </TouchableOpacity>
                ),
              )}
            </View>
          </BottomSheetScrollView>
        </>
      )}

      {step === 'form' && (
        <>
          <SheetHeader
            title={formTitle}
            subtitle={station ?? undefined}
            onClose={() => sheetRef.current?.close()}
            left={
              <TouchableOpacity
                onPress={goBack}
                style={styles.iconBtn}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel="Back"
              >
                <MaterialIcons name="arrow-back" size={20} color={Colors.text} />
              </TouchableOpacity>
            }
          />

          <BottomSheetScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.xl }}
          >
            {issueType === 'lift' || issueType === 'escalator' ? (
              <>
                <EquipmentPicker
                  label={issueType === 'lift' ? 'Which lift?' : 'Which escalator?'}
                  loading={equipmentLoading}
                  equipment={orderedEquipment}
                  selectedId={equipmentId}
                  onSelect={setEquipmentId}
                  emptyText={`No ${issueType}s registered at this station.`}
                  highlightedIds={highlightedIds}
                />
                <FormSection label="Comments (optional)">
                  <TextInput
                    style={styles.textArea}
                    placeholder="e.g. doors won't open…"
                    placeholderTextColor={Colors.placeholderText}
                    value={description}
                    onChangeText={setDescription}
                    multiline
                    numberOfLines={3}
                    textAlignVertical="top"
                  />
                </FormSection>
              </>
            ) : (
              <>
                <FormSection label="Describe the issue">
                  <TextInput
                    style={styles.textArea}
                    placeholder={
                      issueType === 'overcrowding'
                        ? 'e.g. platform dangerously crowded at 8am…'
                        : 'e.g. fallen light blocking path to escalator…'
                    }
                    placeholderTextColor={Colors.placeholderText}
                    value={description}
                    onChangeText={setDescription}
                    multiline
                    numberOfLines={4}
                    textAlignVertical="top"
                  />
                </FormSection>
                <FormSection label="Area within station (optional)">
                  <TextInput
                    style={styles.textInput}
                    placeholder="e.g. northbound platform, main entrance…"
                    placeholderTextColor={Colors.placeholderText}
                    value={area}
                    onChangeText={setArea}
                  />
                </FormSection>
              </>
            )}

            <PhotoPicker photo={photo} onPicked={setPhoto} />

            <View style={[styles.submitRow, { marginBottom: Spacing.lg }]}>
              <TouchableOpacity
                style={[styles.submitBtn, submitting && { opacity: 0.6 }]}
                onPress={submitting ? undefined : submit}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Submit report"
              >
                <Text fontSize={16} fontWeight="700" color={Colors.card}>
                  {submitting ? 'Submitting…' : 'Submit'}
                </Text>
              </TouchableOpacity>
            </View>
          </BottomSheetScrollView>
        </>
      )}

      {step === 'success' && (
        <BottomSheetScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.successContainer,
            { paddingBottom: insets.bottom + Spacing.xl },
          ]}
        >
          <View style={styles.successCircle}>
            <MaterialIcons name="check" size={52} color={Colors.successDark} />
          </View>
          <Text
            fontSize={22}
            fontWeight="700"
            color={Colors.text}
            mt="$5"
            style={{ textAlign: 'center' }}
          >
            Report submitted
          </Text>
          <Text
            fontSize={14}
            color={Colors.secondaryText}
            mt="$2"
            style={{ textAlign: 'center', lineHeight: 20 }}
          >
            A TfL worker will verify the issue soon.
          </Text>
          <TouchableOpacity
            style={styles.okBtn}
            onPress={() => sheetRef.current?.close()}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="OK"
          >
            <Text fontSize={16} fontWeight="600" color={Colors.blue}>
              OK
            </Text>
          </TouchableOpacity>
        </BottomSheetScrollView>
      )}
    </BottomSheet>
  )
}
