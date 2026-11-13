import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PaymentBadge, StatusBadge } from '@/components/sale-card';
import { useToast } from '@/components/toast';
import { Button, Card, ConfirmDialog, Divider, ErrorView, Header, KeyValue, LoadingView, Row, Screen, SectionTitle } from '@/components/ui';
import { Colors, FontSize, Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { useQuery } from '@/hooks/use-query';
import { formatDateTime, formatISODate, isPastISODate, soles } from '@/lib/format';
import { openWhatsAppChat, sendReceiptByWhatsApp } from '@/lib/receipt';
import { errorMessage, supabase } from '@/lib/supabase';
import { ACTIVE_STATUSES, NEXT_STATUS, SALE_STATUS_LABEL, type Sale, type SaleStatus } from '@/types/db';

export default function SaleDetailScreen() {
  const router = useRouter();
  const toast = useToast();
  const { isAdmin } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [busy, setBusy] = useState(false);

  const { data: sale, loading, error, refetch } = useQuery(
    async () => {
      const { data, error: err } = await supabase.from('sales').select('*, sale_items(*)').eq('id', id).single();
      if (err) throw err;
      return data as Sale;
    },
    [id],
    { realtimeTables: ['sales'] }
  );

  const setStatus = async (status: SaleStatus) => {
    if (!sale) return;
    setBusy(true);
    const { error: err } = await supabase.rpc('update_sale_status', { p_sale_id: sale.id, p_status: status });
    setBusy(false);
    setConfirmCancel(false);
    if (err) {
      toast.show(errorMessage(err), 'error');
      return;
    }
    toast.show(status === 'cancelado' ? 'Venta cancelada y stock devuelto' : `Pedido marcado como ${SALE_STATUS_LABEL[status].toLowerCase()}`, 'success');
    refetch();
  };

  const share = async () => {
    if (!sale) return;
    try {
      await sendReceiptByWhatsApp(sale, sale.sale_items ?? []);
    } catch (e) {
      toast.show(errorMessage(e, 'No se pudo abrir WhatsApp'), 'error');
    }
  };

  const next = sale ? NEXT_STATUS[sale.status] : undefined;
  const late = sale && ACTIVE_STATUSES.includes(sale.status) && isPastISODate(sale.delivery_date);

  return (
    <Screen edges={['top', 'bottom']}>
      <Header title={sale?.receipt_code ?? 'Venta'} subtitle={sale ? formatDateTime(sale.created_at) : undefined} back right={sale ? <StatusBadge status={sale.status} /> : undefined} />
      {loading && !sale ? (
        <LoadingView />
      ) : error || !sale ? (
        <ErrorView message={error ?? 'Venta no encontrada'} onRetry={refetch} />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Card style={{ alignItems: 'center', gap: 4 }}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={[styles.total, sale.status === 'cancelado' && { textDecorationLine: 'line-through', color: Colors.textMuted }]}>{soles(sale.total)}</Text>
            <PaymentBadge method={sale.payment_method} />
          </Card>

          <SectionTitle title="Cliente" />
          <Card style={{ gap: 4 }}>
            <KeyValue label="Nombre" value={sale.customer_name} />
            {sale.customer_phone ? (
              <Row style={{ justifyContent: 'space-between' }}>
                <Text style={styles.kvLabel}>Teléfono</Text>
                <Row style={{ gap: Spacing.sm }}>
                  <Text style={styles.kvValue}>{sale.customer_phone}</Text>
                  <Ionicons name="call-outline" size={18} color={Colors.primary} onPress={() => Linking.openURL(`tel:${sale.customer_phone}`)} />
                  <Ionicons name="logo-whatsapp" size={18} color="#25D366" onPress={() => openWhatsAppChat(sale.customer_phone)} />
                </Row>
              </Row>
            ) : null}
            {sale.seller_name ? <KeyValue label="Vendedor" value={sale.seller_name} /> : null}
          </Card>

          {sale.delivery_date || sale.delivery_address ? (
            <>
              <SectionTitle title="Entrega" />
              <Card style={{ gap: 4 }}>
                {sale.delivery_date ? <KeyValue label="Fecha" value={`${formatISODate(sale.delivery_date, true)}${late ? ' · Atrasado' : ''}`} color={late ? Colors.danger : undefined} /> : null}
                {sale.delivery_address ? <KeyValue label="Dirección" value={sale.delivery_address} /> : null}
                {Number(sale.delivery_cost) > 0 ? <KeyValue label="Costo delivery" value={soles(sale.delivery_cost)} /> : null}
              </Card>
            </>
          ) : null}

          <SectionTitle title="Productos" />
          <Card style={{ gap: 4 }}>
            {(sale.sale_items ?? []).map((it) => (
              <View key={it.id} style={styles.item}>
                <Text style={styles.itemQty}>{it.quantity}×</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName}>{it.product_name}</Text>
                  <Text style={styles.itemMeta}>{soles(it.unit_price)} c/u</Text>
                </View>
                <Text style={styles.itemTotal}>{soles(it.total)}</Text>
              </View>
            ))}
            <Divider />
            <KeyValue label="Subtotal" value={soles(sale.subtotal)} />
            {Number(sale.discount) > 0 ? <KeyValue label="Descuento" value={`- ${soles(sale.discount)}`} color={Colors.danger} /> : null}
            {Number(sale.delivery_cost) > 0 ? <KeyValue label="Delivery" value={soles(sale.delivery_cost)} /> : null}
            <KeyValue label="Total" value={soles(sale.total)} bold color={Colors.primary} />
            {sale.notes ? <Text style={styles.notes}>Nota: {sale.notes}</Text> : null}
          </Card>

          <View style={{ gap: Spacing.sm, marginTop: Spacing.lg }}>
            {next ? <Button title={`Marcar como ${SALE_STATUS_LABEL[next].toLowerCase()}`} icon="arrow-forward-circle" size="lg" onPress={() => setStatus(next)} loading={busy} /> : null}
            <Button title="Enviar boleta por WhatsApp" icon="logo-whatsapp" variant="whatsapp" onPress={share} />
            {isAdmin && sale.status !== 'cancelado' ? <Button title="Cancelar venta" icon="close-circle-outline" variant="ghost" onPress={() => setConfirmCancel(true)} /> : null}
            <Button title="Volver" variant="ghost" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
          </View>
        </ScrollView>
      )}

      <ConfirmDialog
        visible={confirmCancel}
        title="¿Cancelar esta venta?"
        message="Se devolverá el stock de los productos al inventario. Esta acción no se puede deshacer."
        confirmText="Sí, cancelar"
        cancelText="No"
        danger
        loading={busy}
        onConfirm={() => setStatus('cancelado')}
        onCancel={() => setConfirmCancel(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.lg, paddingTop: 0, gap: Spacing.sm, paddingBottom: Spacing.xxl },
  totalLabel: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: '600' },
  total: { fontSize: FontSize.display, fontWeight: '900', color: Colors.primary },
  kvLabel: { fontSize: FontSize.md, color: Colors.textSecondary },
  kvValue: { fontSize: FontSize.md, fontWeight: '700', color: Colors.text },
  item: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 6 },
  itemQty: { width: 32, fontWeight: '800', color: Colors.primary },
  itemName: { color: Colors.text, fontSize: FontSize.sm, fontWeight: '600' },
  itemMeta: { color: Colors.textMuted, fontSize: FontSize.xs },
  itemTotal: { fontWeight: '700', color: Colors.text },
  notes: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 6, fontStyle: 'italic' },
});
