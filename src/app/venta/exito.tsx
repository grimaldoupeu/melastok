import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { PaymentBadge } from '@/components/sale-card';
import { useToast } from '@/components/toast';
import { Button, Card, Divider, ErrorView, KeyValue, LoadingView, Screen } from '@/components/ui';
import { Colors, FontSize, Spacing } from '@/constants/theme';
import { useRealtime } from '@/hooks/use-realtime';
import { firebaseErrorMessage } from '@/lib/firebase';
import { formatDateTime, formatISODate, soles } from '@/lib/format';
import { sendReceiptByWhatsApp } from '@/lib/receipt';
import { observarVenta } from '@/services/ventas';
import type { Venta } from '@/types/db';

export default function SaleSuccessScreen() {
  const router = useRouter();
  const toast = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: venta, loading, error } = useRealtime<Venta | null>((onData, onError) => observarVenta(id, onData, onError), [id]);

  const share = async () => {
    if (!venta) return;
    try {
      await sendReceiptByWhatsApp(venta);
    } catch (e) {
      toast.show(firebaseErrorMessage(e, 'No se pudo abrir WhatsApp'), 'error');
    }
  };

  return (
    <Screen edges={['top', 'bottom']}>
      {loading ? (
        <LoadingView text="Cargando boleta…" />
      ) : error || !venta ? (
        <ErrorView message={error ?? 'Venta no encontrada'} />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.hero}>
            <View style={styles.check}>
              <Ionicons name="checkmark" size={44} color={Colors.white} />
            </View>
            <Text style={styles.title}>¡Venta registrada!</Text>
            <Text style={styles.subtitle}>Boleta {venta.codigoBoleta}</Text>
            <Text style={styles.total}>{soles(venta.total)}</Text>
            <PaymentBadge method={venta.metodoPago} />
          </View>

          <Card style={{ gap: 4 }}>
            <KeyValue label="Cliente" value={venta.clienteNombre} />
            {venta.clienteTelefono ? <KeyValue label="Teléfono" value={venta.clienteTelefono} /> : null}
            <KeyValue label="Fecha" value={formatDateTime(venta.fecha)} />
            <KeyValue label="Vendedor" value={venta.vendedorNombre} />
            {venta.fechaEntrega ? <KeyValue label="Entrega" value={formatISODate(venta.fechaEntrega, true)} /> : null}
            {venta.deliveryDireccion ? <KeyValue label="Dirección" value={venta.deliveryDireccion} /> : null}
            <Divider />
            {venta.items.map((it) => (
              <View key={it.productoId} style={styles.item}>
                <Text style={styles.itemQty}>{it.cantidad}×</Text>
                <Text style={styles.itemName} numberOfLines={2}>
                  {it.nombre}
                </Text>
                <Text style={styles.itemTotal}>{soles(it.total)}</Text>
              </View>
            ))}
            <Divider />
            <KeyValue label="Subtotal" value={soles(venta.subtotal)} />
            {venta.descuento > 0 ? <KeyValue label="Descuento" value={`- ${soles(venta.descuento)}`} color={Colors.danger} /> : null}
            {venta.deliveryCosto > 0 ? <KeyValue label="Delivery" value={soles(venta.deliveryCosto)} /> : null}
            <KeyValue label="Total" value={soles(venta.total)} bold color={Colors.primary} />
            {venta.notas ? <Text style={styles.notes}>Nota: {venta.notas}</Text> : null}
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
