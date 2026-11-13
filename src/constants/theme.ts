/**
 * Tema visual de MelaStock: tonos cálidos marrón/madera y crema.
 */
import { Platform } from 'react-native';

export const Colors = {
  primary: '#7A4A2A', // marrón madera
  primaryDark: '#5A3520',
  primaryLight: '#A9714B',
  primarySoft: '#EBD9C6', // marrón muy claro (fondos de chips/iconos)
  accent: '#D9B48F', // tono arena
  background: '#F7F1E8', // crema
  card: '#FFFFFF',
  cardAlt: '#FBF7F1',
  border: '#EADBC8',
  text: '#2B1D14',
  textSecondary: '#6F5A4C',
  textMuted: '#9C8778',
  success: '#3F8F5A',
  successSoft: '#E3F2E8',
  warning: '#D98E2B',
  warningSoft: '#FBEBD3',
  danger: '#C2453A',
  dangerSoft: '#F9E1DE',
  info: '#4A6FA5',
  infoSoft: '#E1E9F5',
  white: '#FFFFFF',
  overlay: 'rgba(43, 29, 20, 0.45)',
  tabInactive: '#A58E7D',
} as const;

/** Colores de marca para métodos de pago */
export const PaymentColors: Record<string, string> = {
  Yape: '#742284',
  Plin: '#00B2A9',
  Efectivo: '#3F8F5A',
  Tarjeta: '#4A6FA5',
};

/** Colores por estado de pedido */
export const StatusColors: Record<string, { bg: string; fg: string }> = {
  pendiente: { bg: Colors.warningSoft, fg: '#9A5F10' },
  en_produccion: { bg: Colors.infoSoft, fg: '#2F4F80' },
  listo: { bg: '#E6E1F7', fg: '#5A3E9E' },
  entregado: { bg: Colors.successSoft, fg: '#2B6B41' },
  cancelado: { bg: Colors.dangerSoft, fg: '#9A2E26' },
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

export const Shadow = {
  card: Platform.select({
    android: { elevation: 3, shadowColor: '#5A3520' },
    default: {
      shadowColor: '#5A3520',
      shadowOpacity: 0.08,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
    },
  }) as object,
  fab: Platform.select({
    android: { elevation: 6, shadowColor: '#5A3520' },
    default: {
      shadowColor: '#5A3520',
      shadowOpacity: 0.25,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
    },
  }) as object,
} as const;

export const FontSize = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  xxl: 26,
  display: 32,
} as const;
