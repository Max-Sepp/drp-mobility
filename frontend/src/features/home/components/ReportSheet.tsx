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
import { apiClient } from '@/api/client'
import type { components } from '@/api/schema.d'
import { EquipmentPicker } from '@/features/reporting/components/EquipmentPicker'
import { FormSection } from '@/features/reporting/components/FormSection'
import { PhotoPicker } from '@/features/reporting/components/PhotoPicker'
import { useTheme, Borders, Heights, Spacing } from '@/theme'

type Equipment = components['schemas']['EquipmentSummary']
type Step = 'type' | 'form' | 'success'
type IssueType = 'lift' | 'escalator' | 'overcrowding' | 'custom'

const SCREEN_H = Dimensions.get('window').height
const SNAP_POINTS = [SCREEN_H * 0.55, SCREEN_H * 0.88]

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
}

export function ReportSheet({ station, onClose }: Props) {
  const { Colors, Radii, Shadows } = useTheme()
  const styles = useMemo(
    () =>
      StyleSheet.create({
        header: {
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: Spacing.sm,
          paddingHorizontal: Spacing.lg,
          paddingBottom: Spacing.md,
        },
        iconBtn: {
          width: 32,
          height: 32,
          borderRadius: 16,
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
          borderRadius: 55,
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
  const sheetRef = useRef<BottomSheetRef>(null)

  const [step, setStep] = useState<Step>('type')
  const [issueType, setIssueType] = useState<IssueType | null>(null)
  const [equipment, setEquipment] = useState<Equipment[]>([])
  const [equipmentId, setEquipmentId] = useState<number | null>(null)
  const [loadingEquipment, setLoadingEquipment] = useState(false)
  const [description, setDescription] = useState('')
  const [area, setArea] = useState('')
  const [photo, setPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [hasLifts, setHasLifts] = useState<boolean | undefined>(undefined)
  const [hasEscalators, setHasEscalators] = useState<boolean | undefined>(undefined)

  function resetForm() {
    setIssueType(null)
    setEquipment([])
    setEquipmentId(null)
    setLoadingEquipment(false)
    setDescription('')
    setArea('')
    setPhoto(null)
    setSubmitting(false)
    setHasLifts(undefined)
    setHasEscalators(undefined)
  }

  useEffect(() => {
    if (station) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      resetForm()
      setStep('type')
      let active = true
      // Fetch equipment availability BEFORE opening the sheet so tiles are already
      // grey/enabled the moment the sheet becomes visible.
      apiClient.GET('/equipment').then(({ data }) => {
        if (!active) return
        if (data) {
          setHasLifts(
            data.some((e) => e.station.name === station && e.equipment_type.name === 'lift'),
          )
          setHasEscalators(
            data.some((e) => e.station.name === station && e.equipment_type.name === 'escalator'),
          )
        }
        sheetRef.current?.snapToIndex(0)
      })
      return () => {
        active = false
      }
    } else {
      sheetRef.current?.close()
    }
  }, [station])

  function handleChange(index: number) {
    if (index === -1) onClose()
  }

  function isTypeDisabled(type: IssueType): boolean {
    if (type === 'lift') return hasLifts === false
    if (type === 'escalator') return hasEscalators === false
    return false
  }

  async function selectType(type: IssueType) {
    setIssueType(type)
    setEquipmentId(null)
    setDescription('')
    setPhoto(null)
    setStep('form')
    sheetRef.current?.snapToIndex(1)

    if (station) {
      setLoadingEquipment(true)
      const { data } = await apiClient.GET('/equipment')
      if (data) {
        if (type === 'lift' || type === 'escalator') {
          setEquipment(
            data
              .filter((e) => e.station.name === station && e.equipment_type.name === type)
              .sort((a, b) =>
                a.connection.localeCompare(b.connection, undefined, { numeric: true }),
              ),
          )
        } else {
          // overcrowding and custom: auto-select the single station-level equipment row
          const equip = data.find(
            (e) => e.station.name === station && e.equipment_type.name === type,
          )
          if (equip) setEquipmentId(equip.id)
        }
      }
      setLoadingEquipment(false)
    }
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
      snapPoints={SNAP_POINTS}
      enablePanDownToClose
      onChange={handleChange}
    >
      {step === 'type' && (
        <>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text fontSize={18} fontWeight="700" color={Colors.text}>
                Report issue
              </Text>
              {station ? (
                <Text fontSize={13} color={Colors.secondaryText} mt="$1">
                  @ {station}
                </Text>
              ) : null}
            </View>
            <TouchableOpacity
              onPress={() => sheetRef.current?.close()}
              style={styles.iconBtn}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <MaterialIcons name="close" size={18} color={Colors.secondaryText} />
            </TouchableOpacity>
          </View>

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
          <View style={styles.header}>
            <TouchableOpacity
              onPress={goBack}
              style={styles.iconBtn}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel="Back"
            >
              <MaterialIcons name="arrow-back" size={20} color={Colors.text} />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text fontSize={18} fontWeight="700" color={Colors.text}>
                {formTitle}
              </Text>
              {station ? (
                <Text fontSize={13} color={Colors.secondaryText} mt="$1">
                  {station}
                </Text>
              ) : null}
            </View>
            <TouchableOpacity
              onPress={() => sheetRef.current?.close()}
              style={styles.iconBtn}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <MaterialIcons name="close" size={18} color={Colors.secondaryText} />
            </TouchableOpacity>
          </View>

          <BottomSheetScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.xl }}
          >
            {issueType === 'lift' || issueType === 'escalator' ? (
              <>
                <EquipmentPicker
                  label={issueType === 'lift' ? 'Which lift?' : 'Which escalator?'}
                  loading={loadingEquipment}
                  equipment={equipment}
                  selectedId={equipmentId}
                  onSelect={setEquipmentId}
                  emptyText={`No ${issueType}s registered at this station.`}
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
