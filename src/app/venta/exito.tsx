import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { PaymentBadge } from '@/components/sale-card';
import { useToast } from '@/components/toast';
import { Button, Card, Divider, ErrorView, KeyValue, LoadingView, Screen } from '@/components/ui';
import { Colors, FontSize, Spacing } from '@/constants/theme';
import { useQuery } from '@/hooks/use-query';
import { formatDateTime, formatISODate, soles } from '@/lib/format';
import { sendReceiptByWhatsApp } from '@/lib/receipt';
import { errorMessage, supabase } from '@/lib/supabase';
import type { Sale } from '@/types/db';

export default function SaleSuccessScreen() {
  const router = useRouter();
  const toast = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: sale, loading, error, refetch } = useQuery(
    async () => {
      const { data, error: err } = await supabase.from('sales').select('*, sale_items(*)').eq('id', id).single();
      if (err) throw err;
      return data as Sale;
    },
    [id],
    { refetchOnFocus: false }
  );

  const share = async () => {
    if (!sale) return;
    try {
      await sendReceiptByWhatsApp(sale, sale.sale_items ?? []);
    } catch (e) {
      toast.show(errorMessage(e, 'No se pudo abrir WhatsApp'), 'error');
    }
  };

  return (
    <Screen edges={['top', 'bottom']}>
      {loading && !sale ? (
        <LoadingView text="Guardando venta…" />
      ) : error || !sale ? (
        <ErrorView message={error ?? 'Venta no encontrada'} onRetry={refetch} />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.hero}>
            <View style={styles.check}>
              <Ionicons name="checkmark" size={44} color={Colors.white} />
            </View>
            <Text style={styles.title}>¡Venta registrada!</Text>
            <Text style={styles.subtitle}>Boleta {sale.receipt_code}</Text>
            <Text style={styles.total}>{soles(sale.total)}</Text>
            <PaymentBadge method={sale.payment_method} />
          </View>

          <Card style={{ gap: 4 }}>
            <KeyValue label="Cliente" value={sale.customer_name} />
            {sale.customer_phone ? <KeyValue label="Teléfono" value={sale.customer_phone} /> : null}
            <KeyValue label="Fecha" value={formatDateTime(sale.created_at)} />
            {sale.seller_name ? <KeyValue label="Vendedor" value={sale.seller_name} /> : null}
            {sale.delivery_date ? <KeyValue label="Entrega" value={formatISODate(sale.delivery_date, true)} /> : null}
            {sale.delivery_address ? <KeyValue label="Dirección" value={sale.delivery_address} /> : null}
            <Divider />
            {(sale.sale_items ?? []).map((it) => (
              <View key={it.id} style={styles.item}>
                <Text style={styles.itemQty}>{it.quantity}×</Text>
                <Text style={styles.itemName} numberOfLines={2}>
                  {it.product_name}
                </Text>
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

          <View style={{ gap: Spacing.sm, marginTop: Spacing.sm }}>
            <Button title="Enviar boleta por WhatsApp" icon="logo-whatsapp" variant="whatsapp" size="lg" onPress={share} />
            <Button title="Nueva venta" icon="cart-outline" variant="secondary" onPress={() => router.replace('/catalogo')} />
            <Button title="Ir al inicio" icon="home-outline" variant="ghost" onPress={() => router.replace('/')} />
          </View>
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: Spacing.xxl },
  hero: { alignItems: 'center', gap: 6, paddingVertical: Spacing.lg },
  check: { width: 84, height: 84, borderRadius: 42, backgroundColor: Colors.success, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.sm },
  title: { fontSize: FontSize.xxl, fontWeight: '900', color: Colors.text },
  subtitle: { fontSize: FontSize.md, color: Colors.textSecondary, fontWeight: '600' },
  total: { fontSize: FontSize.display, fontWeight: '900', color: Colors.primary, marginTop: 4 },
  item: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 4 },
  itemQty: { width: 32, fontWeight: '800', color: Colors.primary },
  itemName: { flex: 1, color: Colors.text, fontSize: FontSize.sm },
  itemTotal: { fontWeight: '700', color: Colors.text },
  notes: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 6, fontStyle: 'italic' },
});
