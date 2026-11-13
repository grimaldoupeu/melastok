/**
 * Conversión de datos de Firestore a JSON y de vuelta.
 * Las fechas (Timestamp) se guardan como { "__tipo": "timestamp", "s": segundos, "n": nanos }.
 */
import { Timestamp } from 'firebase-admin/firestore';

export type JSONValor = string | number | boolean | null | JSONValor[] | { [k: string]: JSONValor };

export type Respaldo = {
  app: 'MelaStock';
  version: 1;
  proyecto: string;
  creadoEn: string;
  colecciones: Record<string, Record<string, Record<string, JSONValor>>>;
};

export function aJSON(v: unknown): JSONValor {
  if (v === null || v === undefined) return null;
  if (v instanceof Timestamp) return { __tipo: 'timestamp', s: v.seconds, n: v.nanoseconds };
  if (Array.isArray(v)) return v.map(aJSON);
  if (typeof v === 'object') return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, aJSON(x)]));
  return v as JSONValor;
}

export function deJSON(v: JSONValor): unknown {
  if (v === null) return null;
  if (Array.isArray(v)) return v.map(deJSON);
  if (typeof v === 'object') {
    if (v.__tipo === 'timestamp') return new Timestamp(Number(v.s), Number(v.n));
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, deJSON(x)]));
  }
  return v;
}
