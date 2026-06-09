// Small centred dialog for capturing an optional free-text note before a trusted-worker action
// (verifying an outage on-site, or resolving it). The note is optional — Confirm submits with or
// without it — so the action stays low-friction.

import { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useTheme, Borders, Overlays, Spacing, Typography } from '@/theme'

type Props = {
  visible: boolean
  submitting: boolean
  title: string
  subtitle: string
  placeholder: string
  confirmLabel: string
  busyLabel: string
  /** Accent colour for the confirm button. Defaults to the verify blue. */
  accentColor?: string
  onConfirm: (description: string | undefined) => void
  onCancel: () => void
}

export function NoteModal({
  visible,
  submitting,
  title,
  subtitle,
  placeholder,
  confirmLabel,
  busyLabel,
  accentColor = '#1d4ed8',
  onConfirm,
  onCancel,
}: Props) {
  const { Colors, Radii } = useTheme()
  const [note, setNote] = useState('')

  // Clear the field whenever the dialog is dismissed so the next open starts empty.
  useEffect(() => {
    if (!visible) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setNote('')
    }
  }, [visible])

  const styles = useMemo(
    () =>
      StyleSheet.create({
        backdrop: {
          flex: 1,
          backgroundColor: Overlays.backdrop,
          justifyContent: 'center',
          paddingHorizontal: Spacing.lg,
        },
        card: {
          backgroundColor: Colors.card,
          borderRadius: Radii.card,
          borderWidth: Borders.medium,
          borderColor: Colors.border,
          padding: Spacing.lg,
          gap: Spacing.md,
        },
        title: { ...Typography.heading, color: Colors.text },
        subtitle: { ...Typography.caption, color: Colors.secondaryText },
        input: {
          minHeight: 80,
          borderRadius: Radii.input,
          borderWidth: Borders.thin,
          borderColor: Colors.border,
          backgroundColor: Colors.searchBg,
          padding: Spacing.md,
          fontSize: 15,
          color: Colors.text,
          textAlignVertical: 'top',
        },
        actions: { flexDirection: 'row', gap: Spacing.sm, justifyContent: 'flex-end' },
        button: {
          paddingVertical: 10,
          paddingHorizontal: Spacing.lg,
          borderRadius: Radii.button,
          alignItems: 'center',
          justifyContent: 'center',
        },
        cancel: { backgroundColor: Colors.searchBg },
        confirm: { backgroundColor: accentColor, flexDirection: 'row', gap: 8 },
        cancelText: { ...Typography.body, fontWeight: '600', color: Colors.text },
        confirmText: { ...Typography.body, fontWeight: '700', color: Colors.card },
      }),
    [Colors, Radii, accentColor],
  )

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
          <TextInput
            style={styles.input}
            placeholder={placeholder}
            placeholderTextColor={Colors.placeholderText}
            value={note}
            onChangeText={setNote}
            multiline
            editable={!submitting}
          />
          <View style={styles.actions}>
            <TouchableOpacity
              onPress={onCancel}
              disabled={submitting}
              style={[styles.button, styles.cancel]}
              activeOpacity={0.7}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => onConfirm(note.trim() || undefined)}
              disabled={submitting}
              style={[styles.button, styles.confirm, { opacity: submitting ? 0.6 : 1 }]}
              activeOpacity={0.7}
            >
              {submitting && <ActivityIndicator size="small" color={Colors.card} />}
              <Text style={styles.confirmText}>{submitting ? busyLabel : confirmLabel}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  )
}
