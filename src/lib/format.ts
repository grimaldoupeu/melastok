/**
 * Formato de moneda y fechas para Perú (soles, zona horaria America/Lima).
 * Lima es UTC-5 sin horario de verano, por lo que el desfase es constante.
 */

const LIMA_OFFSET_MS = -5 * 60 * 60 * 1000;

const MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];
const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const WEEKDAYS_SHORT = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

/** S/ 1,250.00 */
export function soles(value: number | string | null | undefined, decimals = 2): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return 'S/ 0.00';
  const sign = n < 0 ? '-' : '';
  const fixed = Math.abs(n).toFixed(decimals);
  const [int, dec] = fixed.split('.');
  const withSep = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}S/ ${withSep}${dec ? '.' + dec : ''}`;
}

/** Formato compacto para gráficos: 1.2k */
export function solesCompact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 10_000) return `${Math.round(value / 1000)}k`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return `${Math.round(value)}`;
}

/** Cantidad con hasta 2 decimales (para materiales): 12 / 12.5 */
export function qty(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return '0';
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '');
}

/** Partes de la fecha en hora de Lima */
export function limaParts(input: Date | string | number = new Date()) {
  const d = new Date(input);
  const shifted = new Date(d.getTime() + LIMA_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(), // 0-11
    day: shifted.getUTCDate(),
    weekday: shifted.getUTCDay(),
    hours: shifted.getUTCHours(),
    minutes: shifted.getUTCMinutes(),
  };
}

/** Inicio del día (00:00 Lima) como Date UTC */
export function limaStartOfDay(input: Date = new Date()): Date {
  const p = limaParts(input);
  return new Date(Date.UTC(p.year, p.month, p.day, 5, 0, 0, 0));
}

/** Inicio del mes (día 1, 00:00 Lima) como Date UTC */
export function limaStartOfMonth(input: Date = new Date()): Date {
  const p = limaParts(input);
  return new Date(Date.UTC(p.year, p.month, 1, 5, 0, 0, 0));
}

/** Hace N días (00:00 Lima) */
export function limaDaysAgo(days: number, input: Date = new Date()): Date {
  return new Date(limaStartOfDay(input).getTime() - days * 86_400_000);
}

/** YYYY-MM-DD en Lima */
export function toISODate(input: Date | string | number = new Date()): string {
  const p = limaParts(input);
  return `${p.year}-${String(p.month + 1).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** Convierte 'YYYY-MM-DD' en Date (mediodía Lima, evita saltos de día) */
export function fromISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 17, 0, 0));
}

/** 12 nov 2026 */
export function formatDate(input: Date | string | number | null | undefined): string {
  if (!input) return '—';
  const p = limaParts(input);
  return `${p.day} ${MONTHS_SHORT[p.month]} ${p.year}`;
}

/** Para fechas 'YYYY-MM-DD' (entregas): mié 12 nov */
export function formatISODate(iso: string | null | undefined, withYear = false): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${WEEKDAYS_SHORT[wd]} ${d} ${MONTHS_SHORT[m - 1]}${withYear ? ' ' + y : ''}`;
}

/** 12 nov 2026, 3:45 p. m. */
export function formatDateTime(input: Date | string | number | null | undefined): string {
  if (!input) return '—';
  const p = limaParts(input);
  const h12 = p.hours % 12 === 0 ? 12 : p.hours % 12;
  const ampm = p.hours < 12 ? 'a. m.' : 'p. m.';
  return `${p.day} ${MONTHS_SHORT[p.month]} ${p.year}, ${h12}:${String(p.minutes).padStart(2, '0')} ${ampm}`;
}

/** 3:45 p. m. */
export function formatTime(input: Date | string | number): string {
  const p = limaParts(input);
  const h12 = p.hours % 12 === 0 ? 12 : p.hours % 12;
  const ampm = p.hours < 12 ? 'a. m.' : 'p. m.';
  return `${h12}:${String(p.minutes).padStart(2, '0')} ${ampm}`;
}

/** jueves 12 de noviembre */
export function formatLongDate(input: Date = new Date()): string {
  const p = limaParts(input);
  return `${WEEKDAYS[p.weekday]} ${p.day} de ${MONTHS[p.month]}`;
}

/** Nombre del mes actual con mayúscula: Noviembre */
export function monthName(input: Date = new Date()): string {
  const name = MONTHS[limaParts(input).month];
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/** Etiqueta corta de día para gráficos: 12/11 */
export function shortDayLabel(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${Number(d)}/${Number(m)}`;
}

/** ¿La fecha ISO (YYYY-MM-DD) ya pasó respecto a hoy en Lima? */
export function isPastISODate(iso: string | null | undefined): boolean {
  if (!iso) return false;
  return iso < toISODate();
}

export function isTodayISODate(iso: string | null | undefined): boolean {
  return !!iso && iso === toISODate();
}

/** Primer nombre para el saludo */
export function firstName(fullName: string | null | undefined): string {
  if (!fullName) return '';
  return fullName.trim().split(/\s+/)[0];
}

/** Iniciales para el avatar */
export function initials(fullName: string | null | undefined): string {
  if (!fullName) return '?';
  const parts = fullName.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p.charAt(0).toUpperCase()).join('');
}

/** Normaliza un teléfono peruano a formato internacional para wa.me (51XXXXXXXXX) */
export function toWhatsAppNumber(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 9) return `51${digits}`;
  if (digits.startsWith('51') && digits.length === 11) return digits;
  if (digits.startsWith('051') && digits.length === 12) return digits.slice(1);
  return digits;
}

/** Parsea un número escrito por el usuario (acepta coma decimal) */
export function parseNumber(text: string | null | undefined): number {
  if (!text) return 0;
  const n = Number(String(text).replace(',', '.').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}
