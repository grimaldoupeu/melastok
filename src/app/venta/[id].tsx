import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PaymentBadge, StatusBadge } from '@/components/sale-card';
import { useToast } from '@/components/toast';
import { Banner, Button, Card, ConfirmDialog, Divider, ErrorView, Header, KeyValue, LoadingView, Row, Screen, SectionTitle } from '@/components/ui';
import { Colors, FontSize, Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { useRealtime } from '@/hooks/use-realtime';
import { firebaseErrorMessage } from '@/lib/firebase';
import { formatDateTime, formatISODate, isPastISODate, soles } from '@/lib/format';
import { openWhatsAppChat, sendReceiptByWhatsApp } from '@/lib/receipt';
import { cambiarEstadoEntrega, cancelarVenta, ESTADOS_ACTIVOS, observarVenta, SIGUIENTE_ESTADO } from '@/services/ventas';
import { SALE_STATUS_LABEL, type Venta } from '@/types/db';

export default function SaleDetailScreen() {
  const router = useRouter();
  const toast = useToast();
  const { isAdmin, user, profile } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [busy, setBusy] = useState(false);

  const { data: venta, loading, error } = useRealtime<Venta | null>((onData, onError) => observarVenta(id, onData, onError), [id]);

  const avanzar = async () => {
    const next = venta ? SIGUIENTE_ESTADO[venta.estadoEntrega] : undefined;
    if (!venta || !next || next === 'cancelado') return;
    setBusy(true);
    try {
      await cambiarEstadoEntrega(venta.id, next);
      toast.show(`Marcado como ${SALE_STATUS_LABEL[next].toLowerCase()}`, 'success');
    } catch (e) {
      toast.show(firebaseErrorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const anular = async () => {
    if (!venta || !user || !profile) return;
    setBusy(true);
    try {
      await cancelarVenta(venta.id, { uid: user.uid, nombre: profile.nombre });
      toast.show('Venta cancelada y stock devuelto', 'success');
      setConfirmCancel(false);
    } catch (e) {
      toast.show(firebaseErrorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const share = async () => {
    if (!venta) return;
    try {
      await sendReceiptByWhatsApp(venta);
    } catch (e) {
      toast.show(firebaseErrorMessage(e, 'No se pudo abrir WhatsApp'), 'error');
    }
  };

  const next = venta ? SIGUIENTE_ESTADO[venta.estadoEntrega] : undefined;
  const conEntrega = !!venta?.fechaEntrega;
  const late = !!venta && ESTADOS_ACTIVOS.includes(venta.estadoEntrega) && isPastISODate(venta.fechaEntrega);
  const anulada = venta?.estadoEntrega === 'cancelado';

  return (
    <Screen edges={['top', 'bottom']}>
      <Header
        title={venta?.codigoBoleta ?? 'Venta'}
        subtitle={venta ? formatDateTime(venta.fecha) : undefined}
        back
        right={venta && (conEntrega || anulada) ? <StatusBadge status={venta.estadoEntrega} /> : undefined}
      />
      {loading ? (
        <LoadingView />
      ) : error || !venta ? (
        <ErrorView message={error ?? 'Venta no encontrada'} />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {anulada ? (
            <Banner
              tone="danger"
              icon="close-circle"
              text={`Venta anulada${venta.canceladaPorNombre ? ` por ${venta.canceladaPorNombre}` : ''}${venta.canceladaEn ? ` el ${formatDateTime(venta.canceladaEn)}` : ''}. El stock fue devuelto.`}
            />
          ) : null}

          <Card style={{ alignItems: 'center', gap: 4 }}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={[styles.total, anulada && { textDecorationLine: 'line-through', color: Colors.textMuted }]}>{soles(venta.total)}</Text>
            <PaymentBadge method={venta.metodoPago} />
          </Card>

          <SectionTitle title="Cliente" />
          <Card style={{ gap: 4 }}>
            <KeyValue label="Nombre" value={venta.clienteNombre} />
            {venta.clienteTelefono ? (
              <Row style={{ justifyContent: 'space-between' }}>
                <Text style={styles.kvLabel}>Teléfono</Text>
                <Row style={{ gap: Spacing.md }}>
                  <Text style={styles.kvValue}>{venta.clienteTelefono}</Text>
                  <Ionicons name="call-outline" size={20} color={Colors.primary} onPress={() => Linking.openURL(`tel:${venta.clienteTelefono}`)} />
                  <Ionicons name="logo-whatsapp" size={20} color="#25D366" onPress={() => openWhatsAppChat(venta.clienteTelefono)} />
                </Row>
              </Row>
            ) : null}
            <KeyValue label="Vendedor" value={venta.vendedorNombre} />
          </Card>

          {venta.fechaEntrega || venta.deliveryDireccion ? (
            <>
              <SectionTitle title="Entrega" />
              <Card style={{ gap: 4 }}>
                {venta.fechaEntrega ? (
                  <KeyValue label="Fecha" value={`${formatISODate(venta.fechaEntrega, true)}${late ? ' · Atrasado' : ''}`} color={late ? Colors.danger : undefined} />
                ) : null}
                {venta.deliveryDireccion ? <KeyValue label="Dirección" value={venta.deliveryDireccion} /> : null}
                {venta.deliveryCosto > 0 ? <KeyValue label="Costo delivery" value={soles(venta.deliveryCosto)} /> : null}
              </Card>
            </>
          ) : null}

          <SectionTitle title="Productos" />
          <Card style={{ gap: 4 }}>
            {venta.items.map((it) => (
              <View key={it.productoId} style={styles.item}>
                <Text style={styles.itemQty}>{it.cantidad}×</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName}>{it.nombre}</Text>
                  <Text style={styles.itemMeta}>{soles(it.precio)} c/u</Text>
                </View>
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

          <View style={{ gap: Spacing.sm, marginTop: Spacing.lg }}>
            {next && next !== 'cancelado' && conEntrega ? (
              <Button title={`Marcar como ${SALE_STATUS_LABEL[next].toLowerCase()}`} icon="arrow-forward-circle" size="lg" onPress={avanzar} loading={busy} />
            ) : null}
            <Button title="Enviar boleta por WhatsApp" icon="logo-whatsapp" variant="whatsapp" onPress={share} />
            {isAdmin && !anulada ? <Button title="Cancelar venta" icon="close-circle-outline" variant="ghost" onPress={() => setConfirmCancel(true)} /> : null}
            <Button title="Volver" variant="ghost" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
          </View>
        </ScrollView>
      )}

      <ConfirmDialog
        visible={confirmCancel}
        title="¿Cancelar esta venta?"
        message="Se devolverá el stock de los productos, se restará del resumen del día y la boleta quedará anulada. No se puede deshacer."
        confirmText="Sí, cancelar"
        cancelText="No"
        danger
        loading={busy}
        onConfirm={anular}
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
