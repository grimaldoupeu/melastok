import { Linking } from 'react-native';

import { formatDateTime, formatISODate, soles, toWhatsAppNumber } from '@/lib/format';
import type { Sale, SaleItem } from '@/types/db';

const BUSINESS_NAME = process.env.EXPO_PUBLIC_BUSINESS_NAME || 'Muebles de Melamina';
const BUSINESS_PHONE = process.env.EXPO_PUBLIC_BUSINESS_PHONE || '';
const BUSINESS_ADDRESS = process.env.EXPO_PUBLIC_BUSINESS_ADDRESS || '';

/** Genera el texto de la boleta para enviar por WhatsApp */
export function buildReceiptText(sale: Sale, items: SaleItem[]): string {
  const lines: string[] = [];
  lines.push(`🪵 *${BUSINESS_NAME}*`);
  if (BUSINESS_ADDRESS) lines.push(BUSINESS_ADDRESS);
  if (BUSINESS_PHONE) lines.push(`Tel: ${BUSINESS_PHONE}`);
  lines.push('');
  lines.push(`*BOLETA ${sale.receipt_code}*`);
  lines.push(`Fecha: ${formatDateTime(sale.created_at)}`);
  lines.push(`Cliente: ${sale.customer_name}`);
  if (sale.customer_phone) lines.push(`Teléfono: ${sale.customer_phone}`);
  if (sale.seller_name) lines.push(`Atendido por: ${sale.seller_name}`);
  lines.push('');
  lines.push('*DETALLE*');
  for (const it of items) {
    lines.push(`• ${it.quantity} x ${it.product_name}`);
    lines.push(`   ${soles(it.unit_price)} c/u = ${soles(it.total)}`);
  }
  lines.push('');
  lines.push(`Subtotal: ${soles(sale.subtotal)}`);
  if (Number(sale.discount) > 0) lines.push(`Descuento: -${soles(sale.discount)}`);
  if (Number(sale.delivery_cost) > 0) lines.push(`Delivery: ${soles(sale.delivery_cost)}`);
  lines.push(`*TOTAL: ${soles(sale.total)}*`);
  lines.push(`Pago: ${sale.payment_method}`);
  if (sale.delivery_date) {
    lines.push('');
    lines.push(`📦 Entrega: ${formatISODate(sale.delivery_date, true)}`);
    if (sale.delivery_address) lines.push(`📍 ${sale.delivery_address}`);
  }
  if (sale.notes) {
    lines.push('');
    lines.push(`Nota: ${sale.notes}`);
  }
  lines.push('');
  lines.push('¡Gracias por su compra! 🙌');
  return lines.join('\n');
}

/** Abre WhatsApp (wa.me) con el comprobante. Si no hay teléfono, deja elegir el contacto. */
export async function sendReceiptByWhatsApp(sale: Sale, items: SaleItem[]): Promise<void> {
  const text = encodeURIComponent(buildReceiptText(sale, items));
  const number = toWhatsAppNumber(sale.customer_phone);
  const url = number ? `https://wa.me/${number}?text=${text}` : `https://wa.me/?text=${text}`;
  await Linking.openURL(url);
}

/** Abre un chat de WhatsApp con un número (sin mensaje) */
export async function openWhatsAppChat(phone: string | null | undefined): Promise<void> {
  const number = toWhatsAppNumber(phone);
  if (!number) return;
  await Linking.openURL(`https://wa.me/${number}`);
}
