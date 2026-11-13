/**
 * Kit de componentes base de MelaStock (tarjetas, botones, inputs, chips, etc.)
 */
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { type ComponentProps, type ReactNode, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
  type ViewProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, FontSize, Radius, Shadow, Spacing } from '@/constants/theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

/* ------------------------------------------------------------------ */
/* Layout                                                              */
/* ------------------------------------------------------------------ */

export function Screen({
  children,
  style,
  edges = ['top'],
  ...rest
}: ViewProps & { edges?: ('top' | 'bottom')[] }) {
  return (
    <SafeAreaView edges={edges} style={[styles.screen, style]} {...rest}>
      {children}
    </SafeAreaView>
  );
}

export function Header({
  title,
  subtitle,
  back,
  right,
  onBack,
}: {
  title: string;
  subtitle?: string;
  back?: boolean;
  right?: ReactNode;
  onBack?: () => void;
}) {
  const router = useRouter();
  return (
    <View style={styles.header}>
      {back ? (
        <Pressable
          onPress={onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/')))}
          hitSlop={10}
          style={styles.headerBack}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </Pressable>
      ) : null}
      <View style={{ flex: 1 }}>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.headerSubtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}

export function Card({ children, style, ...rest }: ViewProps) {
  return (
    <View style={[styles.card, style]} {...rest}>
      {children}
    </View>
  );
}

export function SectionTitle({
  title,
  action,
  onAction,
  style,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
  style?: ViewStyle;
}) {
  return (
    <View style={[styles.sectionTitle, style]}>
      <Text style={styles.sectionTitleText}>{title}</Text>
      {action ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text style={styles.sectionAction}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Divider({ style }: { style?: ViewStyle }) {
  return <View style={[styles.divider, style]} />;
}

export function Row({ children, style, ...rest }: ViewProps) {
  return (
    <View style={[styles.row, style]} {...rest}>
      {children}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Botones                                                             */
/* ------------------------------------------------------------------ */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'whatsapp';

export function Button({
  title,
  onPress,
  variant = 'primary',
  icon,
  loading,
  disabled,
  size = 'md',
  style,
}: {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  style?: ViewStyle;
}) {
  const palette: Record<ButtonVariant, { bg: string; fg: string; border?: string }> = {
    primary: { bg: Colors.primary, fg: Colors.white },
    secondary: { bg: Colors.card, fg: Colors.primary, border: Colors.primary },
    ghost: { bg: 'transparent', fg: Colors.primary },
    danger: { bg: Colors.danger, fg: Colors.white },
    success: { bg: Colors.success, fg: Colors.white },
    whatsapp: { bg: '#25D366', fg: Colors.white },
  };
  const p = palette[variant];
  const isDisabled = disabled || loading;
  const height = size === 'sm' ? 38 : size === 'lg' ? 56 : 48;
  const fontSize = size === 'sm' ? FontSize.sm : size === 'lg' ? FontSize.lg : FontSize.md;
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: p.bg,
          borderColor: p.border ?? 'transparent',
          borderWidth: p.border ? 1.5 : 0,
          height,
          opacity: isDisabled ? 0.55 : pressed ? 0.85 : 1,
        },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={p.fg} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={size === 'sm' ? 16 : 20} color={p.fg} /> : null}
          <Text style={[styles.buttonText, { color: p.fg, fontSize }]}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

export function IconButton({
  icon,
  onPress,
  color = Colors.text,
  bg = Colors.primarySoft,
  size = 40,
  disabled,
  style,
}: {
  icon: IconName;
  onPress?: () => void;
  color?: string;
  bg?: string;
  size?: number;
  disabled?: boolean;
  style?: ViewStyle;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      style={({ pressed }) => [
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: bg,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
        },
        style,
      ]}>
      <Ionicons name={icon} size={size * 0.5} color={color} />
    </Pressable>
  );
}

export function Fab({
  title,
  icon = 'cart',
  onPress,
  badge,
}: {
  title: string;
  icon?: IconName;
  onPress: () => void;
  badge?: number;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.fab, { bottom: Spacing.lg + insets.bottom, opacity: pressed ? 0.9 : 1 }]}>
      <Ionicons name={icon} size={20} color={Colors.white} />
      <Text style={styles.fabText}>{title}</Text>
      {badge ? (
        <View style={styles.fabBadge}>
          <Text style={styles.fabBadgeText}>{badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/* ------------------------------------------------------------------ */
/* Inputs                                                              */
/* ------------------------------------------------------------------ */

export function Input({
  label,
  error,
  hint,
  icon,
  right,
  style,
  containerStyle,
  ...rest
}: TextInputProps & {
  label?: string;
  error?: string | null;
  hint?: string;
  icon?: IconName;
  right?: ReactNode;
  containerStyle?: ViewStyle;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[{ gap: 6 }, containerStyle]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View
        style={[
          styles.inputWrap,
          focused && { borderColor: Colors.primary },
          error ? { borderColor: Colors.danger } : null,
          rest.multiline && { minHeight: 90, alignItems: 'flex-start', paddingVertical: 10 },
        ]}>
        {icon ? <Ionicons name={icon} size={18} color={Colors.textMuted} /> : null}
        <TextInput
          placeholderTextColor={Colors.textMuted}
          style={[styles.input, style]}
          onFocus={(e) => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
          {...rest}
        />
        {right}
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

export function SearchBar({
  value,
  onChangeText,
  placeholder = 'Buscar…',
  style,
}: {
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  style?: ViewStyle;
}) {
  return (
    <View style={[styles.search, style]}>
      <Ionicons name="search" size={18} color={Colors.textMuted} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={Colors.textMuted}
        style={styles.searchInput}
        autoCorrect={false}
        returnKeyType="search"
      />
      {value ? (
        <Pressable onPress={() => onChangeText('')} hitSlop={8}>
          <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
        </Pressable>
      ) : null}
    </View>
  );
}

export function Chip({
  label,
  active,
  onPress,
  icon,
  color = Colors.primary,
  style,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  icon?: IconName;
  color?: string;
  style?: ViewStyle;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        active && { backgroundColor: color, borderColor: color },
        pressed && { opacity: 0.8 },
        style,
      ]}>
      {icon ? <Ionicons name={icon} size={14} color={active ? Colors.white : color} /> : null}
      <Text style={[styles.chipText, active && { color: Colors.white }]}>{label}</Text>
    </Pressable>
  );
}

export function Stepper({
  value,
  onIncrement,
  onDecrement,
  max,
  size = 'md',
}: {
  value: number;
  onIncrement: () => void;
  onDecrement: () => void;
  max?: number;
  size?: 'sm' | 'md';
}) {
  const dim = size === 'sm' ? 28 : 34;
  const atMax = max !== undefined && value >= max;
  return (
    <View style={styles.stepper}>
      <Pressable onPress={onDecrement} hitSlop={6} style={[styles.stepperBtn, { width: dim, height: dim }]}>
        <Ionicons name={value <= 1 ? 'trash-outline' : 'remove'} size={16} color={Colors.primary} />
      </Pressable>
      <Text style={[styles.stepperValue, { minWidth: dim }]}>{value}</Text>
      <Pressable
        onPress={onIncrement}
        disabled={atMax}
        hitSlop={6}
        style={[styles.stepperBtn, { width: dim, height: dim, backgroundColor: Colors.primary }, atMax && { opacity: 0.35 }]}>
        <Ionicons name="add" size={16} color={Colors.white} />
      </Pressable>
    </View>
  );
}

export function Toggle({
  value,
  onChange,
  label,
  description,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <Pressable onPress={() => onChange(!value)} style={styles.toggleRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.toggleLabel}>{label}</Text>
        {description ? <Text style={styles.hint}>{description}</Text> : null}
      </View>
      <View style={[styles.toggleTrack, value && { backgroundColor: Colors.primary }]}>
        <View style={[styles.toggleThumb, value && { alignSelf: 'flex-end' }]} />
      </View>
    </Pressable>
  );
}

export type PickerOption<T extends string | number> = { value: T; label: string; icon?: IconName };

export function PickerField<T extends string | number>({
  label,
  value,
  options,
  onChange,
  placeholder = 'Seleccionar',
  icon,
}: {
  label?: string;
  value: T | null;
  options: PickerOption<T>[];
  onChange: (v: T) => void;
  placeholder?: string;
  icon?: IconName;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  return (
    <View style={{ gap: 6 }}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <Pressable onPress={() => setOpen(true)} style={styles.inputWrap}>
        {icon ? <Ionicons name={icon} size={18} color={Colors.textMuted} /> : null}
        <Text style={[styles.input, !selected && { color: Colors.textMuted }]}>{selected?.label ?? placeholder}</Text>
        <Ionicons name="chevron-down" size={18} color={Colors.textMuted} />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setOpen(false)}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>{label ?? placeholder}</Text>
            <FlatList
              data={options}
              keyExtractor={(o) => String(o.value)}
              style={{ maxHeight: 360 }}
              renderItem={({ item }) => {
                const active = item.value === value;
                return (
                  <Pressable
                    onPress={() => {
                      onChange(item.value);
                      setOpen(false);
                    }}
                    style={[styles.modalOption, active && { backgroundColor: Colors.primarySoft }]}>
                    {item.icon ? <Ionicons name={item.icon} size={18} color={Colors.primary} /> : null}
                    <Text style={[styles.modalOptionText, active && { color: Colors.primary, fontWeight: '700' }]}>
                      {item.label}
                    </Text>
                    {active ? <Ionicons name="checkmark" size={18} color={Colors.primary} /> : null}
                  </Pressable>
                );
              }}
            />
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Indicadores                                                         */
/* ------------------------------------------------------------------ */

export function Badge({
  label,
  bg = Colors.primarySoft,
  fg = Colors.primary,
  icon,
  style,
}: {
  label: string;
  bg?: string;
  fg?: string;
  icon?: IconName;
  style?: ViewStyle;
}) {
  return (
    <View style={[styles.badge, { backgroundColor: bg }, style]}>
      {icon ? <Ionicons name={icon} size={12} color={fg} /> : null}
      <Text style={[styles.badgeText, { color: fg }]}>{label}</Text>
    </View>
  );
}

export function StatCard({
  label,
  value,
  sub,
  icon,
  color = Colors.primary,
  onPress,
  style,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: IconName;
  color?: string;
  onPress?: () => void;
  style?: ViewStyle;
}) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => [styles.card, styles.stat, pressed && { opacity: 0.85 }, style]}>
      <View style={[styles.statIcon, { backgroundColor: color + '22' }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      {sub ? <Text style={styles.statSub}>{sub}</Text> : null}
    </Pressable>
  );
}

export function Banner({
  text,
  icon = 'alert-circle',
  tone = 'warning',
  onPress,
  action,
}: {
  text: string;
  icon?: IconName;
  tone?: 'warning' | 'danger' | 'info' | 'success';
  onPress?: () => void;
  action?: string;
}) {
  const tones = {
    warning: { bg: Colors.warningSoft, fg: '#9A5F10' },
    danger: { bg: Colors.dangerSoft, fg: '#9A2E26' },
    info: { bg: Colors.infoSoft, fg: '#2F4F80' },
    success: { bg: Colors.successSoft, fg: '#2B6B41' },
  };
  const t = tones[tone];
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={[styles.banner, { backgroundColor: t.bg }]}>
      <Ionicons name={icon} size={20} color={t.fg} />
      <Text style={[styles.bannerText, { color: t.fg }]}>{text}</Text>
      {action ? <Text style={[styles.bannerAction, { color: t.fg }]}>{action}</Text> : null}
    </Pressable>
  );
}

export function Avatar({ text, size = 40, onPress }: { text: string; size?: number; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress}>
      <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
        <Text style={[styles.avatarText, { fontSize: size * 0.38 }]}>{text}</Text>
      </View>
    </Pressable>
  );
}

export function EmptyState({
  icon = 'file-tray-outline',
  title,
  description,
  action,
  onAction,
}: {
  icon?: IconName;
  title: string;
  description?: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={30} color={Colors.primary} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      {description ? <Text style={styles.emptyDesc}>{description}</Text> : null}
      {action ? <Button title={action} onPress={onAction} variant="secondary" size="sm" style={{ marginTop: 8 }} /> : null}
    </View>
  );
}

export function LoadingView({ text = 'Cargando…' }: { text?: string }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={Colors.primary} />
      <Text style={styles.hint}>{text}</Text>
    </View>
  );
}

export function ErrorView({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.center}>
      <Ionicons name="cloud-offline-outline" size={36} color={Colors.danger} />
      <Text style={[styles.emptyTitle, { color: Colors.danger }]}>No se pudo cargar</Text>
      <Text style={styles.emptyDesc}>{message}</Text>
      {onRetry ? <Button title="Reintentar" onPress={onRetry} variant="secondary" size="sm" /> : null}
    </View>
  );
}

export function KeyValue({ label, value, bold, color }: { label: string; value: string; bold?: boolean; color?: string }) {
  return (
    <View style={styles.kv}>
      <Text style={[styles.kvLabel, bold && { color: Colors.text, fontWeight: '700' }]}>{label}</Text>
      <Text style={[styles.kvValue, bold && { fontSize: FontSize.lg, fontWeight: '800' }, color ? { color } : null]}>{value}</Text>
    </View>
  );
}

/** Diálogo de confirmación simple (reemplaza Alert para mantener el estilo) */
export function ConfirmDialog({
  visible,
  title,
  message,
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  danger,
  loading,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={[styles.modalBackdrop, { justifyContent: 'center', padding: Spacing.xl }]}>
        <View style={[styles.card, { gap: Spacing.md }]}>
          <Text style={styles.modalTitle}>{title}</Text>
          {message ? <Text style={styles.emptyDesc}>{message}</Text> : null}
          <Row style={{ gap: Spacing.sm, marginTop: Spacing.sm }}>
            <Button title={cancelText} variant="ghost" onPress={onCancel} style={{ flex: 1 }} disabled={loading} />
            <Button
              title={confirmText}
              variant={danger ? 'danger' : 'primary'}
              onPress={onConfirm}
              loading={loading}
              style={{ flex: 1 }}
            />
          </Row>
        </View>
      </View>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
  },
  headerBack: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  headerTitle: { fontSize: FontSize.xxl, fontWeight: '800', color: Colors.text, letterSpacing: -0.3 },
  headerSubtitle: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 2 },
  card: {
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    ...Shadow.card,
  },
  sectionTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  sectionTitleText: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.text },
  sectionAction: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.primary },
  divider: { height: 1, backgroundColor: Colors.border, marginVertical: Spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center' },

  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.md,
  },
  buttonText: { fontWeight: '700' },
  fab: {
    position: 'absolute',
    right: Spacing.lg,
    left: Spacing.lg,
    height: 54,
    borderRadius: Radius.pill,
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    ...Shadow.fab,
  },
  fabText: { color: Colors.white, fontWeight: '800', fontSize: FontSize.md },
  fabBadge: {
    position: 'absolute',
    right: 16,
    backgroundColor: Colors.accent,
    minWidth: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  fabBadgeText: { color: Colors.primaryDark, fontWeight: '800', fontSize: FontSize.sm },

  label: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.textSecondary },
  inputWrap: {
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
  input: { flex: 1, fontSize: FontSize.md, color: Colors.text, paddingVertical: 10 },
  errorText: { fontSize: FontSize.xs, color: Colors.danger, fontWeight: '600' },
  hint: { fontSize: FontSize.xs, color: Colors.textMuted },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.card,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.lg,
    height: 46,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchInput: { flex: 1, fontSize: FontSize.md, color: Colors.text },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    height: 36,
    borderRadius: Radius.pill,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipText: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.text },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.cardAlt,
    borderRadius: Radius.pill,
    padding: 3,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  stepperBtn: {
    borderRadius: Radius.pill,
    backgroundColor: Colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperValue: { textAlign: 'center', fontWeight: '800', fontSize: FontSize.md, color: Colors.text },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.sm },
  toggleLabel: { fontSize: FontSize.md, fontWeight: '700', color: Colors.text },
  toggleTrack: { width: 48, height: 28, borderRadius: 14, backgroundColor: Colors.border, padding: 3 },
  toggleThumb: { width: 22, height: 22, borderRadius: 11, backgroundColor: Colors.white },
  modalBackdrop: { flex: 1, backgroundColor: Colors.overlay, justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
    gap: Spacing.sm,
  },
  modalTitle: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.text, marginBottom: 4 },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: 12,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.md,
  },
  modalOptionText: { flex: 1, fontSize: FontSize.md, color: Colors.text },

  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.pill,
    alignSelf: 'flex-start',
  },
  badgeText: { fontSize: FontSize.xs, fontWeight: '700' },
  stat: { flex: 1, gap: 4, padding: Spacing.md },
  statIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  statLabel: { fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: '600' },
  statValue: { fontSize: FontSize.xl, fontWeight: '800', color: Colors.text },
  statSub: { fontSize: FontSize.xs, color: Colors.textMuted },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Radius.md,
  },
  bannerText: { flex: 1, fontSize: FontSize.sm, fontWeight: '600' },
  bannerAction: { fontSize: FontSize.sm, fontWeight: '800' },
  avatar: { backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: Colors.white, fontWeight: '800' },
  empty: { alignItems: 'center', gap: 6, paddingVertical: Spacing.xxl, paddingHorizontal: Spacing.xl },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  emptyTitle: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.text, textAlign: 'center' },
  emptyDesc: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, padding: Spacing.xl },
  kv: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  kvLabel: { fontSize: FontSize.md, color: Colors.textSecondary },
  kvValue: { fontSize: FontSize.md, fontWeight: '700', color: Colors.text },
});
