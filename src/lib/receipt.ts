import { Linking } from 'react-native';

import { formatDateTime, formatISODate, soles, toWhatsAppNumber } from '@/lib/format';
import type { Venta } from '@/types/db';

const BUSINESS_NAME = process.env.EXPO_PUBLIC_BUSINESS_NAME || 'Muebles de Melamina';
const BUSINESS_PHONE = process.env.EXPO_PUBLIC_BUSINESS_PHONE || '';
const BUSINESS_ADDRESS = process.env.EXPO_PUBLIC_BUSINESS_ADDRESS || '';

/** Genera el texto de la boleta para enviar por WhatsApp */
export function buildReceiptText(venta: Venta): string {
  const lines: string[] = [];
  lines.push(`🪵 *${BUSINESS_NAME}*`);
  if (BUSINESS_ADDRESS) lines.push(BUSINESS_ADDRESS);
  if (BUSINESS_PHONE) lines.push(`Tel: ${BUSINESS_PHONE}`);
  lines.push('');
  lines.push(`*BOLETA ${venta.codigoBoleta}*`);
  if (venta.estadoEntrega === 'cancelado') lines.push('*** ANULADA ***');
  lines.push(`Fecha: ${formatDateTime(venta.fecha)}`);
  lines.push(`Cliente: ${venta.clienteNombre}`);
  if (venta.clienteTelefono) lines.push(`Teléfono: ${venta.clienteTelefono}`);
  if (venta.vendedorNombre) lines.push(`Atendido por: ${venta.vendedorNombre}`);
  lines.push('');
  lines.push('*DETALLE*');
  for (const it of venta.items) {
    lines.push(`• ${it.cantidad} x ${it.nombre}`);
    lines.push(`   ${soles(it.precio)} c/u = ${soles(it.total)}`);
  }
  lines.push('');
  lines.push(`Subtotal: ${soles(venta.subtotal)}`);
  if (venta.descuento > 0) lines.push(`Descuento: -${soles(venta.descuento)}`);
  if (venta.deliveryCosto > 0) lines.push(`Delivery: ${soles(venta.deliveryCosto)}`);
  lines.push(`*TOTAL: ${soles(venta.total)}*`);
  lines.push(`Pago: ${venta.metodoPago}`);
  if (venta.fechaEntrega) {
    lines.push('');
    lines.push(`📦 Entrega: ${formatISODate(venta.fechaEntrega, true)}`);
    if (venta.deliveryDireccion) lines.push(`📍 ${venta.deliveryDireccion}`);
  } else if (venta.deliveryDireccion) {
    lines.push('');
    lines.push(`📍 Delivery: ${venta.deliveryDireccion}`);
  }
  if (venta.notas) {
    lines.push('');
    lines.push(`Nota: ${venta.notas}`);
  }
  lines.push('');
  lines.push('¡Gracias por su compra! 🙌');
  return lines.join('\n');
}

/** Abre WhatsApp (wa.me) con el comprobante. Si no hay teléfono, deja elegir el contacto. */
export async function sendReceiptByWhatsApp(venta: Venta): Promise<void> {
  const text = encodeURIComponent(buildReceiptText(venta));
  const number = toWhatsAppNumber(venta.clienteTelefono);
  const url = number ? `https://wa.me/${number}?text=${text}` : `https://wa.me/?text=${text}`;
  await Linking.openURL(url);
}

/** Abre un chat de WhatsApp con un número (sin mensaje) */
export async function openWhatsAppChat(phone: string | null | undefined): Promise<void> {
  const number = toWhatsAppNumber(phone);
  if (!number) return;
  await Linking.openURL(`https://wa.me/${number}`);
}
