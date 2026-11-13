import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerAndroid, type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui';
import { Colors, FontSize, Radius, Spacing } from '@/constants/theme';
import { formatISODate, fromISODate, toISODate } from '@/lib/format';

/** Campo de fecha (YYYY-MM-DD) con el selector nativo de cada plataforma */
export function DateField({
  label,
  value,
  onChange,
  minimumDate,
  placeholder = 'Elegir fecha',
  allowClear = true,
}: {
  label?: string;
  value: string | null;
  onChange: (iso: string | null) => void;
  minimumDate?: Date;
  placeholder?: string;
  allowClear?: boolean;
}) {
  const [iosOpen, setIosOpen] = useState(false);
  const current = value ? fromISODate(value) : new Date();

  const open = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: current,
        mode: 'date',
        minimumDate,
        onChange: (event: DateTimePickerEvent, date?: Date) => {
          if (event.type === 'set' && date) onChange(toISODate(date));
        },
      });
    } else {
      setIosOpen(true);
    }
  };

  return (
    <View style={{ gap: 6 }}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <Pressable onPress={open} style={styles.field}>
        <Ionicons name="calendar-outline" size={18} color={Colors.textMuted} />
        <Text style={[styles.value, !value && { color: Colors.textMuted }]}>{value ? formatISODate(value, true) : placeholder}</Text>
        {value && allowClear ? (
          <Pressable onPress={() => onChange(null)} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
          </Pressable>
        ) : (
          <Ionicons name="chevron-down" size={18} color={Colors.textMuted} />
        )}
      </Pressable>

      {Platform.OS !== 'android' ? (
        <Modal visible={iosOpen} transparent animationType="fade" onRequestClose={() => setIosOpen(false)}>
          <View style={styles.backdrop}>
            <View style={styles.sheet}>
              <DateTimePicker
                value={current}
                mode="date"
                display={Platform.OS === 'ios' ? 'inline' : 'default'}
                minimumDate={minimumDate}
                onChange={(_e, date) => date && onChange(toISODate(date))}
              />
              <Button title="Listo" onPress={() => setIosOpen(false)} />
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.textSecondary },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.card,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    minHeight: 48,
  },
  value: { flex: 1, fontSize: FontSize.md, color: Colors.text },
  backdrop: { flex: 1, backgroundColor: Colors.overlay, justifyContent: 'center', padding: Spacing.xl },
  sheet: { backgroundColor: Colors.card, borderRadius: Radius.lg, padding: Spacing.lg, gap: Spacing.md },
});
