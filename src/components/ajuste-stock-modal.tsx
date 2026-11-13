import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, StyleSheet, Text, View } from 'react-native';

import { useToast } from '@/components/toast';
import { Button, IconButton, Input, Row } from '@/components/ui';
import { Colors, FontSize, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { firebaseErrorMessage } from '@/lib/firebase';
import { parseNumber, qty } from '@/lib/format';
import { ajustarStock } from '@/services/inventario';
import type { ItemTipo } from '@/types/db';

const MOTIVOS = ['Conteo físico', 'Merma / daño', 'Corrección de error', 'Devolución'];

/** Ajuste de stock (solo admin): fija el stock al valor contado con un motivo */
export function AjusteStockModal({
  visible,
  onClose,
  itemTipo,
  itemId,
  nombre,
  stockActual,
  unidad,
}: {
  visible: boolean;
  onClose: () => void;
  itemTipo: ItemTipo;
  itemId: string;
  nombre: string;
  stockActual: number;
  unidad?: string;
}) {
  const toast = useToast();
  const { user, profile } = useAuth();
  const [stock, setStock] = useState('');
  const [motivo, setMotivo] = useState('');
  const [saving, setSaving] = useState(false);

  const nuevo = parseNumber(stock);
  const diferencia = stock.trim() ? nuevo - stockActual : 0;

  const guardar = async () => {
    if (!user || !profile) return;
    if (!stock.trim()) return toast.show('Ingresa el stock contado', 'error');
    setSaving(true);
    try {
      await ajustarStock({ itemTipo, itemId, stockNuevo: nuevo, motivo }, { uid: user.uid, nombre: profile.nombre });
      toast.show('Stock ajustado', 'success');
      setStock('');
      setMotivo('');
      onClose();
    } catch (e) {
      toast.show(firebaseErrorMessage(e), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
        <View style={styles.sheet}>
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Ajustar stock</Text>
              <Text style={styles.sub} numberOfLines={1}>
                {nombre} · actual {qty(stockActual)} {unidad ?? ''}
              </Text>
            </View>
            <IconButton icon="close" onPress={onClose} size={34} />
          </Row>
          <Input
            label={`Stock contado${unidad ? ` (${unidad})` : ''}`}
            placeholder={qty(stockActual)}
            value={stock}
            onChangeText={setStock}
            keyboardType={itemTipo === 'producto' ? 'number-pad' : 'decimal-pad'}
            autoFocus
            hint={stock.trim() ? `Diferencia: ${diferencia > 0 ? '+' : ''}${qty(diferencia)}` : 'Se registrará en el kardex como ajuste'}
          />
          <View style={{ gap: 6 }}>
            <Input label="Motivo" placeholder="Ej. conteo físico del sábado" value={motivo} onChangeText={setMotivo} />
            <Row style={{ gap: 6, flexWrap: 'wrap' }}>
              {MOTIVOS.map((m) => (
                <Button key={m} title={m} size="sm" variant="ghost" onPress={() => setMotivo(m)} style={styles.motivo} />
              ))}
            </Row>
          </View>
          <Button title="Guardar ajuste" icon="checkmark" onPress={guardar} loading={saving} disabled={!stock.trim() || motivo.trim().length < 3} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: Colors.overlay, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
    gap: Spacing.md,
  },
  title: { fontSize: FontSize.xl, fontWeight: '800', color: Colors.text },
  sub: { fontSize: FontSize.sm, color: Colors.textSecondary },
  motivo: { height: 32, paddingHorizontal: 10, backgroundColor: Colors.primarySoft },
});
