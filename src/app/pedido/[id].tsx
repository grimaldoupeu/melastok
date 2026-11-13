import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { DateField } from '@/components/date-field';
import { KardexList } from '@/components/kardex-list';
import { EtapaBadge, EtapaProgress, pedidoAtrasado } from '@/components/pedido-card';
import { PaymentBadge } from '@/components/sale-card';
import { useToast } from '@/components/toast';
import { Banner, Button, Card, Chip, ConfirmDialog, Divider, ErrorView, Header, IconButton, Input, KeyValue, LoadingView, Row, Screen, SectionTitle } from '@/components/ui';
import { Colors, FontSize, PaymentColors, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { useRealtime } from '@/hooks/use-realtime';
import { firebaseErrorMessage } from '@/lib/firebase';
import { formatDateTime, formatISODate, parseNumber, soles, toISODate } from '@/lib/format';
import { openWhatsAppChat, sendPedidoByWhatsApp } from '@/lib/receipt';
import { observarClientesRecientes } from '@/services/clientes';
import { observarConsumosPedido } from '@/services/movimientos';
import { cambiarEtapa, crearPedido, editarPedido, etapaAnterior, etapaSiguiente, observarPedido, registrarPago } from '@/services/pedidos';
import { ETAPA_LABEL, PAYMENT_METHODS, type Cliente, type EtapaPedido, type MetodoPago, type Movimiento, type Pedido } from '@/types/db';

export default function PedidoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'nuevo';
  const [editing, setEditing] = useState(false);
  const pedido = useRealtime<Pedido | null>((onData, onError) => observarPedido(id, onData, onError), [id], !isNew);

  if (isNew) return <PedidoForm pedido={null} />;
  if (pedido.loading) {
    return (
      <Screen edges={['top', 'bottom']}>
        <Header title="Pedido" back />
        <LoadingView />
      </Screen>
    );
  }
  if (pedido.error || !pedido.data) {
    return (
      <Screen edges={['top', 'bottom']}>
        <Header title="Pedido" back />
        <ErrorView message={pedido.error ?? 'Pedido no encontrado'} />
      </Screen>
    );
  }
  if (editing) return <PedidoForm key={pedido.data.id} pedido={pedido.data} onDone={() => setEditing(false)} />;
  return <PedidoDetail pedido={pedido.data} onEdit={() => setEditing(true)} />;
}

/* ------------------------------------------------------------------ */
/* Detalle                                                             */
/* ------------------------------------------------------------------ */

function PedidoDetail({ pedido, onEdit }: { pedido: Pedido; onEdit: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const { isAdmin, user, profile } = useAuth();
  const [etapaDestino, setEtapaDestino] = useState<EtapaPedido | null>(null);
  const [showPago, setShowPago] = useState(false);
  const consumos = useRealtime<Movimiento[]>((onData, onError) => observarConsumosPedido(pedido.id, onData, onError), [pedido.id], isAdmin);

  const usuario = user && profile ? { uid: user.uid, nombre: profile.nombre } : null;
  const siguiente = etapaSiguiente(pedido.etapa);
  const anterior = etapaAnterior(pedido.etapa);
  const cerrado = pedido.etapa === 'cancelado';
  const atrasado = pedidoAtrasado(pedido);
  const ganancia = pedido.precio - pedido.costoMateriales;

  const whatsapp = async () => {
    try {
      await sendPedidoByWhatsApp(pedido);
    } catch (e) {
      toast.show(firebaseErrorMessage(e, 'No se pudo abrir WhatsApp'), 'error');
    }
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <Header title={pedido.codigo} subtitle={pedido.clienteNombre} back right={<EtapaBadge etapa={pedido.etapa} />} />
      <ScrollView contentContainerStyle={styles.content}>
        {atrasado ? <Banner tone="danger" icon="alarm-outline" text={`Atrasado: la entrega era el ${formatISODate(pedido.fechaEntrega, true)}.`} /> : null}
        {cerrado ? <Banner tone="danger" icon="close-circle" text="Pedido cancelado. Ya no se puede modificar." /> : null}

        {/* Progreso */}
        <Card style={{ gap: Spacing.md }}>
          <Text style={styles.sectionLabel}>Etapa del taller</Text>
          <EtapaProgress etapa={pedido.etapa} />
          {!cerrado ? (
            <Row style={{ gap: Spacing.sm }}>
              {anterior ? (
                <Button title={`← ${ETAPA_LABEL[anterior]}`} variant="ghost" size="sm" onPress={() => setEtapaDestino(anterior)} style={{ flex: 1 }} />
              ) : null}
              {siguiente ? (
                <Button
                  title={siguiente === 'entregado' ? 'Marcar entregado' : `Pasar a ${ETAPA_LABEL[siguiente].toLowerCase()}`}
                  icon="arrow-forward-circle"
                  size="sm"
                  variant={siguiente === 'entregado' ? 'success' : 'primary'}
                  onPress={() => setEtapaDestino(siguiente)}
                  style={{ flex: 2 }}
                />
              ) : null}
            </Row>
          ) : null}
        </Card>

        {/* Pagos */}
        <Card style={{ gap: Spacing.sm }}>
          <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View>
              <Text style={styles.sectionLabel}>Saldo por cobrar</Text>
              <Text style={[styles.saldo, pedido.saldo <= 0 && { color: Colors.success }]}>{pedido.saldo > 0 ? soles(pedido.saldo) : 'Pagado'}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.meta}>Total {soles(pedido.precio)}</Text>
              <Text style={styles.meta}>Pagado {soles(pedido.pagado)}</Text>
            </View>
          </Row>
          <View style={styles.payBar}>
            <View style={[styles.payFill, { width: `${Math.min(100, Math.round((pedido.pagado / pedido.precio) * 100))}%` }]} />
          </View>
          {pedido.pagos.length ? <Divider /> : null}
          {pedido.pagos.map((p, i) => (
            <Row key={i} style={{ gap: Spacing.sm, paddingVertical: 4 }}>
              <PaymentBadge method={p.metodo} />
              <View style={{ flex: 1 }}>
                <Text style={styles.pagoTitulo}>{i === 0 && p.nota === 'Adelanto' ? 'Adelanto' : p.nota || `Pago ${i + 1}`}</Text>
                <Text style={styles.meta}>
                  {formatDateTime(p.fecha)} · {p.usuarioNombre}
                </Text>
              </View>
              <Text style={styles.pagoMonto}>{soles(p.monto)}</Text>
            </Row>
          ))}
          {!cerrado && pedido.saldo > 0 ? <Button title="Registrar pago" icon="cash-outline" onPress={() => setShowPago(true)} /> : null}
        </Card>

        {/* Datos */}
        <SectionTitle title="Detalle" />
        <Card style={{ gap: 4 }}>
          <Text style={styles.desc}>{pedido.descripcion}</Text>
          {pedido.medidas ? <KeyValue label="Medidas" value={pedido.medidas} /> : null}
          {pedido.materialColor ? <KeyValue label="Material / color" value={pedido.materialColor} /> : null}
          <KeyValue label="Entrega" value={pedido.fechaEntrega ? formatISODate(pedido.fechaEntrega, true) : 'Sin fecha'} color={atrasado ? Colors.danger : undefined} />
          <KeyValue label="Registrado por" value={pedido.vendedorNombre} />
          {pedido.clienteTelefono ? (
            <Row style={{ justifyContent: 'space-between', paddingVertical: 4 }}>
              <Text style={styles.kvLabel}>Teléfono</Text>
              <Row style={{ gap: Spacing.md }}>
                <Text style={styles.kvValue}>{pedido.clienteTelefono}</Text>
                <Ionicons name="call-outline" size={20} color={Colors.primary} onPress={() => Linking.openURL(`tel:${pedido.clienteTelefono}`)} />
                <Ionicons name="logo-whatsapp" size={20} color="#25D366" onPress={() => openWhatsAppChat(pedido.clienteTelefono)} />
              </Row>
            </Row>
          ) : null}
          {pedido.notas ? <Text style={styles.notes}>Nota: {pedido.notas}</Text> : null}
        </Card>

        {/* Costos (solo admin) */}
        {isAdmin ? (
          <>
            <SectionTitle title="Costos (solo admin)" />
            <Card style={{ gap: 4 }}>
              <KeyValue label="Precio" value={soles(pedido.precio)} />
              <KeyValue label="Costo de materiales" value={`- ${soles(pedido.costoMateriales)}`} color={Colors.danger} />
              <Divider />
              <KeyValue label="Ganancia estimada" value={soles(ganancia)} bold color={ganancia >= 0 ? Colors.success : Colors.danger} />
              <Text style={styles.meta}>
                {pedido.precio > 0 ? `Margen ${Math.round((ganancia / pedido.precio) * 100)}% · ` : ''}No incluye mano de obra ni otros gastos.
              </Text>
              <Divider />
              <Text style={styles.sectionLabel}>Materiales consumidos</Text>
              <KardexList
                movimientos={consumos.data ?? []}
                mostrarItem
                vacio="Registra consumos desde Inventario > Materiales eligiendo este pedido"
                onPressItem={(m) => router.push({ pathname: '/material/[id]', params: { id: m.itemId } })}
              />
            </Card>
          </>
        ) : null}

        {/* Historial */}
        <SectionTitle title="Historial de etapas" />
        <Card style={{ paddingVertical: Spacing.sm }}>
          {[...pedido.historialEtapas].reverse().map((h, i) => (
            <View key={i}>
              <Row style={{ gap: Spacing.md, paddingVertical: 8, alignItems: 'flex-start' }}>
                <View style={[styles.dot, h.etapa === 'cancelado' && { backgroundColor: Colors.danger }, h.etapa === 'entregado' && { backgroundColor: Colors.success }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.pagoTitulo}>{ETAPA_LABEL[h.etapa]}</Text>
                  <Text style={styles.meta}>
                    {formatDateTime(h.fecha)} · {h.usuarioNombre}
                  </Text>
                  {h.nota ? <Text style={styles.notes}>“{h.nota}”</Text> : null}
                </View>
              </Row>
              {i < pedido.historialEtapas.length - 1 ? <Divider style={{ marginVertical: 0 }} /> : null}
            </View>
          ))}
        </Card>

        <View style={{ gap: Spacing.sm, marginTop: Spacing.md }}>
          <Button title="Enviar estado por WhatsApp" icon="logo-whatsapp" variant="whatsapp" onPress={whatsapp} />
          {!cerrado ? <Button title="Editar datos" icon="pencil-outline" variant="secondary" onPress={onEdit} /> : null}
          {isAdmin && !cerrado && pedido.etapa !== 'entregado' ? (
            <Button title="Cancelar pedido" icon="close-circle-outline" variant="ghost" onPress={() => setEtapaDestino('cancelado')} />
          ) : null}
        </View>
      </ScrollView>

      {etapaDestino && usuario ? (
        <EtapaModal
          pedido={pedido}
          destino={etapaDestino}
          onClose={() => setEtapaDestino(null)}
          onConfirm={async (nota) => {
            await cambiarEtapa({ pedidoId: pedido.id, etapa: etapaDestino, nota }, usuario);
            toast.show(etapaDestino === 'cancelado' ? 'Pedido cancelado' : `Pedido en ${ETAPA_LABEL[etapaDestino].toLowerCase()}`, 'success');
          }}
        />
      ) : null}
      {showPago && usuario ? <PagoModal pedido={pedido} usuario={usuario} onClose={() => setShowPago(false)} /> : null}
    </Screen>
  );
}

function EtapaModal({
  pedido,
  destino,
  onClose,
  onConfirm,
}: {
  pedido: Pedido;
  destino: EtapaPedido;
  onClose: () => void;
  onConfirm: (nota: string | null) => Promise<void>;
}) {
  const toast = useToast();
  const [nota, setNota] = useState('');
  const [saving, setSaving] = useState(false);
  const cancelar = destino === 'cancelado';

  const confirmar = async () => {
    setSaving(true);
    try {
      await onConfirm(nota.trim() || null);
      onClose();
    } catch (e) {
      toast.show(firebaseErrorMessage(e), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ConfirmDialog
      visible
      title={cancelar ? `¿Cancelar ${pedido.codigo}?` : `${ETAPA_LABEL[pedido.etapa]} → ${ETAPA_LABEL[destino]}`}
      message={
        cancelar
          ? 'El pedido quedará cancelado y no se podrá modificar. Los pagos registrados se conservan (devuelve el dinero por fuera si corresponde).'
          : undefined
      }
      confirmText={cancelar ? 'Cancelar pedido' : 'Confirmar'}
      cancelText="Volver"
      danger={cancelar}
      loading={saving}
      onConfirm={confirmar}
      onCancel={onClose}>
      <Input placeholder={cancelar ? 'Motivo de la cancelación' : 'Nota (opcional)'} value={nota} onChangeText={setNota} />
    </ConfirmDialog>
  );
}

function PagoModal({ pedido, usuario, onClose }: { pedido: Pedido; usuario: { uid: string; nombre: string }; onClose: () => void }) {
  const toast = useToast();
  const [monto, setMonto] = useState(pedido.saldo.toFixed(2));
  const [metodo, setMetodo] = useState<MetodoPago>('Yape');
  const [nota, setNota] = useState('');
  const [saving, setSaving] = useState(false);
  const n = parseNumber(monto);

  const guardar = async () => {
    if (!(n > 0)) return toast.show('Ingresa un monto mayor a 0', 'error');
    if (n > pedido.saldo + 0.001) return toast.show(`El pago supera el saldo (${soles(pedido.saldo)})`, 'error');
    setSaving(true);
    try {
      await registrarPago({ pedidoId: pedido.id, monto: n, metodo, nota: nota.trim() || null }, usuario);
      toast.show(`Pago de ${soles(n)} registrado`, 'success');
      onClose();
    } catch (e) {
      toast.show(firebaseErrorMessage(e), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
        <View style={styles.sheet}>
          <Row style={{ justifyContent: 'space-between' }}>
            <View>
              <Text style={styles.sheetTitle}>Registrar pago</Text>
              <Text style={styles.meta}>
                {pedido.codigo} · saldo {soles(pedido.saldo)}
              </Text>
            </View>
            <IconButton icon="close" onPress={onClose} size={34} />
          </Row>
          <Input label="Monto (S/)" icon="cash-outline" value={monto} onChangeText={setMonto} keyboardType="decimal-pad" autoFocus hint={n > 0 && n < pedido.saldo ? `Quedará un saldo de ${soles(pedido.saldo - n)}` : undefined} />
          <View style={{ gap: 6 }}>
            <Text style={styles.label}>Método de pago</Text>
            <View style={styles.paymentRow}>
              {PAYMENT_METHODS.map((m) => (
                <Chip key={m} label={m} active={metodo === m} color={PaymentColors[m]} onPress={() => setMetodo(m)} />
              ))}
            </View>
          </View>
          <Input label="Nota (opcional)" placeholder="Ej. pago al armar" value={nota} onChangeText={setNota} />
          <Button title={`Registrar ${n > 0 ? soles(n) : 'pago'}`} icon="checkmark" onPress={guardar} loading={saving} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Formulario (nuevo / editar)                                         */
/* ------------------------------------------------------------------ */

function PedidoForm({ pedido, onDone }: { pedido: Pedido | null; onDone?: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const { isAdmin, user, profile } = useAuth();
  const isNew = !pedido;
  const clientes = useRealtime(observarClientesRecientes, [], isNew);

  const [clienteNombre, setClienteNombre] = useState(pedido?.clienteNombre ?? '');
  const [clienteTelefono, setClienteTelefono] = useState(pedido?.clienteTelefono ?? '');
  const [showSugerencias, setShowSugerencias] = useState(false);
  const [descripcion, setDescripcion] = useState(pedido?.descripcion ?? '');
  const [medidas, setMedidas] = useState(pedido?.medidas ?? '');
  const [materialColor, setMaterialColor] = useState(pedido?.materialColor ?? '');
  const [notas, setNotas] = useState(pedido?.notas ?? '');
  const [fechaEntrega, setFechaEntrega] = useState<string | null>(() => pedido?.fechaEntrega ?? toISODate(new Date(Date.now() + 15 * 86_400_000)));
  const [precio, setPrecio] = useState(pedido ? String(pedido.precio) : '');
  const [adelanto, setAdelanto] = useState('');
  const [metodo, setMetodo] = useState<MetodoPago>('Yape');
  const [saving, setSaving] = useState(false);

  const sugerencias = useMemo(() => {
    const q = clienteNombre.trim().toLowerCase();
    if (!isNew || q.length < 2 || !showSugerencias) return [];
    const digits = q.replace(/\D/g, '');
    return (clientes.data ?? []).filter((c) => c.nombre.toLowerCase().includes(q) || (digits.length >= 3 && c.telefono?.includes(digits))).slice(0, 5);
  }, [clienteNombre, showSugerencias, clientes.data, isNew]);

  const elegirCliente = (c: Cliente) => {
    setClienteNombre(c.nombre);
    setClienteTelefono(c.telefono ?? '');
    setShowSugerencias(false);
  };

  const precioN = parseNumber(precio);
  const adelantoN = parseNumber(adelanto);
  const precioEditable = isNew || isAdmin;

  const guardar = async () => {
    if (!user || !profile) return;
    if (clienteNombre.trim().length < 2) return toast.show('Ingresa el nombre del cliente', 'error');
    if (clienteTelefono && clienteTelefono.replace(/\D/g, '').length < 9) return toast.show('El teléfono debe tener 9 dígitos', 'error');
    if (descripcion.trim().length < 3) return toast.show('Describe el mueble a fabricar', 'error');
    if (!(precioN > 0)) return toast.show('Ingresa el precio del pedido', 'error');
    if (adelantoN > precioN) return toast.show('El adelanto no puede superar el precio', 'error');
    if (pedido && precioN < pedido.pagado) return toast.show(`El precio no puede ser menor a lo ya pagado (${soles(pedido.pagado)})`, 'error');
    setSaving(true);
    try {
      if (isNew) {
        const r = await crearPedido(
          {
            clienteNombre,
            clienteTelefono: clienteTelefono || null,
            descripcion,
            medidas: medidas || null,
            materialColor: materialColor || null,
            notas: notas || null,
            precio: precioN,
            fechaEntrega,
            adelanto: adelantoN > 0 ? { monto: adelantoN, metodo, nota: 'Adelanto' } : null,
          },
          { uid: user.uid, nombre: profile.nombre }
        );
        toast.show(`Pedido ${r.codigo} registrado`, 'success');
        router.replace({ pathname: '/pedido/[id]', params: { id: r.id } });
      } else {
        await editarPedido(pedido, {
          clienteNombre,
          clienteTelefono: clienteTelefono || null,
          descripcion,
          medidas: medidas || null,
          materialColor: materialColor || null,
          notas: notas || null,
          fechaEntrega,
          precio: precioEditable ? precioN : pedido.precio,
        });
        toast.show('Pedido actualizado', 'success');
        onDone?.();
      }
    } catch (e) {
      toast.show(firebaseErrorMessage(e), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <Header title={isNew ? 'Nuevo pedido a medida' : `Editar ${pedido.codigo}`} back onBack={onDone} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <SectionTitle title="Cliente" style={{ marginTop: 0 }} />
          <Card style={{ gap: Spacing.md }}>
            <View>
              <Input
                label="Nombre"
                icon="person-outline"
                placeholder="Nombre o teléfono del cliente"
                value={clienteNombre}
                onChangeText={(t) => {
                  setClienteNombre(t);
                  setShowSugerencias(true);
                }}
                autoCapitalize="words"
              />
              {sugerencias.length ? (
                <View style={styles.suggestions}>
                  {sugerencias.map((c) => (
                    <Pressable key={c.id} onPress={() => elegirCliente(c)} style={({ pressed }) => [styles.suggestion, pressed && { backgroundColor: Colors.primarySoft }]}>
                      <Ionicons name="person-circle-outline" size={20} color={Colors.primary} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.pagoTitulo}>{c.nombre}</Text>
                        {c.telefono ? <Text style={styles.meta}>{c.telefono}</Text> : null}
                      </View>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>
            <Input label="Teléfono (WhatsApp)" icon="logo-whatsapp" placeholder="987654321" value={clienteTelefono} onChangeText={(t) => setClienteTelefono(t.replace(/[^\d+ ]/g, ''))} keyboardType="phone-pad" maxLength={15} />
          </Card>

          <SectionTitle title="Mueble" />
          <Card style={{ gap: Spacing.md }}>
            <Input label="Descripción" placeholder="Cocina en L con alacena y repostero alto" value={descripcion} onChangeText={setDescripcion} multiline />
            <Input label="Medidas" icon="resize-outline" placeholder="2.40 x 0.60 x 0.90 m" value={medidas} onChangeText={setMedidas} />
            <Input label="Material / color" icon="color-palette-outline" placeholder="Melamina blanca 18 mm, tapacanto 2 mm" value={materialColor} onChangeText={setMaterialColor} />
            <DateField label="Fecha de entrega" value={fechaEntrega} onChange={setFechaEntrega} />
            <Input label="Notas" placeholder="Dirección de instalación, detalles…" value={notas} onChangeText={setNotas} multiline />
          </Card>

          <SectionTitle title="Precio y pago" />
          <Card style={{ gap: Spacing.md }}>
            <Input
              label="Precio total (S/)"
              icon="pricetag-outline"
              placeholder="0.00"
              value={precio}
              onChangeText={setPrecio}
              keyboardType="decimal-pad"
              editable={precioEditable}
              hint={precioEditable ? undefined : 'Solo el administrador puede cambiar el precio'}
            />
            {isNew ? (
              <>
                <Input
                  label="Adelanto (S/)"
                  icon="cash-outline"
                  placeholder="0.00"
                  value={adelanto}
                  onChangeText={setAdelanto}
                  keyboardType="decimal-pad"
                  hint={precioN > 0 ? `Saldo por cobrar: ${soles(Math.max(0, precioN - adelantoN))}` : undefined}
                />
                {adelantoN > 0 ? (
                  <View style={styles.paymentRow}>
                    {PAYMENT_METHODS.map((m) => (
                      <Chip key={m} label={m} active={metodo === m} color={PaymentColors[m]} onPress={() => setMetodo(m)} />
                    ))}
                  </View>
                ) : null}
              </>
            ) : null}
          </Card>

          <Button title={isNew ? 'Registrar pedido' : 'Guardar cambios'} icon="save-outline" size="lg" onPress={guardar} loading={saving} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.lg, paddingTop: 0, gap: Spacing.md, paddingBottom: Spacing.xxl },
  sectionLabel: { fontSize: FontSize.xs, fontWeight: '800', color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  saldo: { fontSize: FontSize.display, fontWeight: '900', color: Colors.danger },
  meta: { fontSize: FontSize.xs, color: Colors.textMuted },
  payBar: { height: 8, borderRadius: 4, backgroundColor: Colors.border, overflow: 'hidden' },
  payFill: { height: 8, borderRadius: 4, backgroundColor: Colors.success },
  pagoTitulo: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.text },
  pagoMonto: { fontSize: FontSize.md, fontWeight: '800', color: Colors.text },
  desc: { fontSize: FontSize.md, color: Colors.text, fontWeight: '600', marginBottom: 4 },
  kvLabel: { fontSize: FontSize.md, color: Colors.textSecondary },
  kvValue: { fontSize: FontSize.md, fontWeight: '700', color: Colors.text },
  notes: { fontSize: FontSize.sm, color: Colors.textSecondary, fontStyle: 'italic', marginTop: 4 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.primary, marginTop: 5 },
  label: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.textSecondary },
  paymentRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  suggestions: { backgroundColor: Colors.card, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, marginTop: 6, overflow: 'hidden' },
  suggestion: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border },
  backdrop: { flex: 1, backgroundColor: Colors.overlay, justifyContent: 'flex-end' },
  sheet: { backgroundColor: Colors.background, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, padding: Spacing.lg, paddingBottom: Spacing.xxl, gap: Spacing.md },
  sheetTitle: { fontSize: FontSize.xl, fontWeight: '800', color: Colors.text },
});
