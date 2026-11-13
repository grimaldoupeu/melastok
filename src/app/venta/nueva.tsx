import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { DateField } from '@/components/date-field';
import { ProductImage } from '@/components/product-card';
import { useToast } from '@/components/toast';
import { Button, Card, Chip, Divider, EmptyState, Header, Input, KeyValue, Screen, SectionTitle, Stepper, Toggle } from '@/components/ui';
import { Colors, FontSize, PaymentColors, Radius, Spacing } from '@/constants/theme';
import { parseNumber, soles, toISODate } from '@/lib/format';
import { errorMessage, supabase } from '@/lib/supabase';
import { selectCartSubtotal, useCart } from '@/store/cart';
import { PAYMENT_METHODS, type Customer, type PaymentMethod, type Sale } from '@/types/db';

export default function NewSaleScreen() {
  const router = useRouter();
  const toast = useToast();
  const items = useCart((s) => s.items);
  const increment = useCart((s) => s.increment);
  const decrement = useCart((s) => s.decrement);
  const clear = useCart((s) => s.clear);
  const subtotal = useCart(selectCartSubtotal);

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [suggestions, setSuggestions] = useState<Customer[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [withDeliveryDate, setWithDeliveryDate] = useState(false);
  const [deliveryDate, setDeliveryDate] = useState<string | null>(null);
  const [withDelivery, setWithDelivery] = useState(false);
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryCost, setDeliveryCost] = useState('');
  const [discount, setDiscount] = useState('');
  const [payment, setPayment] = useState<PaymentMethod>('Yape');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Búsqueda de clientes existentes mientras se escribe
  useEffect(() => {
    const q = customerName.trim();
    if (q.length < 2 || !showSuggestions) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from('customers')
        .select('*')
        .or(`name.ilike.%${q}%,phone.ilike.%${q}%`)
        .order('created_at', { ascending: false })
        .limit(5);
      if (!cancelled) setSuggestions((data ?? []) as Customer[]);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [customerName, showSuggestions]);

  const pickCustomer = (c: Customer) => {
    setCustomerName(c.name);
    setCustomerPhone(c.phone ?? '');
    if (c.address && !deliveryAddress) setDeliveryAddress(c.address);
    setShowSuggestions(false);
    setSuggestions([]);
  };

  const discountN = Math.max(0, parseNumber(discount));
  const deliveryN = withDelivery ? Math.max(0, parseNumber(deliveryCost)) : 0;
  const total = Math.max(0, subtotal - discountN + deliveryN);

  const validation = useMemo(() => {
    if (items.length === 0) return 'El carrito está vacío';
    if (customerName.trim().length < 2) return 'Ingresa el nombre del cliente';
    if (customerPhone && customerPhone.replace(/\D/g, '').length < 9) return 'El teléfono debe tener 9 dígitos';
    if (discountN > subtotal) return 'El descuento no puede superar el subtotal';
    if (withDeliveryDate && !deliveryDate) return 'Elige la fecha de entrega';
    if (withDelivery && deliveryAddress.trim().length < 4) return 'Ingresa la dirección de entrega';
    return null;
  }, [items.length, customerName, customerPhone, discountN, subtotal, withDeliveryDate, deliveryDate, withDelivery, deliveryAddress]);

  const submit = async () => {
    if (validation) {
      toast.show(validation, 'error');
      return;
    }
    setSubmitting(true);
    const { data, error } = await supabase.rpc('create_sale', {
      p_customer_name: customerName.trim(),
      p_customer_phone: customerPhone.trim() || null,
      p_items: items.map((i) => ({ product_id: i.producto.id, quantity: i.cantidad })),
      p_payment_method: payment,
      p_discount: discountN,
      p_delivery_cost: deliveryN,
      p_delivery_address: withDelivery ? deliveryAddress.trim() : null,
      p_delivery_date: withDeliveryDate ? deliveryDate : null,
      p_notes: notes.trim() || null,
    });
    setSubmitting(false);
    if (error) {
      toast.show(errorMessage(error), 'error');
      return;
    }
    const sale = data as Sale;
    clear();
    router.replace({ pathname: '/venta/exito', params: { id: sale.id } });
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="Nueva venta" subtitle={`${items.length} ${items.length === 1 ? 'producto' : 'productos'} en el carrito`} back />
      {items.length === 0 ? (
        <EmptyState icon="cart-outline" title="Tu carrito está vacío" description="Agrega productos desde el catálogo para registrar una venta." action="Ir al catálogo" onAction={() => router.back()} />
      ) : (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {/* Carrito */}
            <Card style={{ gap: Spacing.sm, paddingVertical: Spacing.sm }}>
              {items.map((it, idx) => (
                <View key={it.producto.id}>
                  <View style={styles.cartRow}>
                    <ProductImage uri={it.producto.fotoUrl} size={48} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cartName} numberOfLines={2}>
                        {it.producto.nombre}
                      </Text>
                      <Text style={styles.cartMeta}>
                        {soles(it.producto.precio)} c/u · {it.producto.stock} disp.
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 6 }}>
                      <Text style={styles.cartTotal}>{soles(Number(it.producto.precio) * it.cantidad)}</Text>
                      <Stepper
                        size="sm"
                        value={it.cantidad}
                        max={it.producto.stock}
                        onIncrement={() => increment(it.producto.id) === 'sin_stock' && toast.show('No hay más stock disponible', 'error')}
                        onDecrement={() => decrement(it.producto.id)}
                      />
                    </View>
                  </View>
                  {idx < items.length - 1 ? <Divider style={{ marginVertical: 4 }} /> : null}
                </View>
              ))}
            </Card>

            {/* Cliente */}
            <SectionTitle title="Cliente" />
            <Card style={{ gap: Spacing.md }}>
              <View>
                <Input
                  label="Nombre"
                  icon="person-outline"
                  placeholder="Nombre del cliente"
                  value={customerName}
                  onChangeText={(t) => {
                    setCustomerName(t);
                    setShowSuggestions(true);
                  }}
                  onFocus={() => setShowSuggestions(true)}
                  autoCapitalize="words"
                />
                {showSuggestions && customerName.trim().length >= 2 && suggestions.length > 0 ? (
                  <View style={styles.suggestions}>
                    {suggestions.map((c) => (
                      <Pressable key={c.id} onPress={() => pickCustomer(c)} style={({ pressed }) => [styles.suggestion, pressed && { backgroundColor: Colors.primarySoft }]}>
                        <Ionicons name="person-circle-outline" size={20} color={Colors.primary} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.suggestionName}>{c.name}</Text>
                          {c.phone ? <Text style={styles.cartMeta}>{c.phone}</Text> : null}
                        </View>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
              </View>
              <Input
                label="Teléfono (WhatsApp)"
                icon="logo-whatsapp"
                placeholder="987654321"
                value={customerPhone}
                onChangeText={(t) => setCustomerPhone(t.replace(/[^\d+ ]/g, ''))}
                keyboardType="phone-pad"
                maxLength={15}
                hint="Se usará para enviar la boleta por WhatsApp"
              />
            </Card>

            {/* Entrega */}
            <SectionTitle title="Entrega" />
            <Card style={{ gap: Spacing.sm }}>
              <Toggle
                label="Programar fecha de entrega"
                description="La venta aparecerá como pedido pendiente"
                value={withDeliveryDate}
                onChange={(v) => {
                  setWithDeliveryDate(v);
                  if (v && !deliveryDate) setDeliveryDate(toISODate(new Date(Date.now() + 7 * 86_400_000)));
                }}
              />
              {withDeliveryDate ? <DateField value={deliveryDate} onChange={setDeliveryDate} minimumDate={new Date()} allowClear={false} /> : null}
              <Divider />
              <Toggle label="Delivery a domicilio" description="Agrega dirección y costo de envío" value={withDelivery} onChange={setWithDelivery} />
              {withDelivery ? (
                <View style={{ gap: Spacing.md }}>
                  <Input label="Dirección" icon="location-outline" placeholder="Av. Principal 123, distrito" value={deliveryAddress} onChangeText={setDeliveryAddress} />
                  <Input label="Costo de delivery (S/)" icon="bicycle-outline" placeholder="0.00" value={deliveryCost} onChangeText={setDeliveryCost} keyboardType="decimal-pad" />
                </View>
              ) : null}
            </Card>

            {/* Pago */}
            <SectionTitle title="Pago" />
            <Card style={{ gap: Spacing.md }}>
              <Input label="Descuento (S/)" icon="pricetag-outline" placeholder="0.00" value={discount} onChangeText={setDiscount} keyboardType="decimal-pad" />
              <View style={{ gap: 6 }}>
                <Text style={styles.label}>Método de pago</Text>
                <View style={styles.paymentRow}>
                  {PAYMENT_METHODS.map((m) => (
                    <Chip
                      key={m}
                      label={m}
                      active={payment === m}
                      color={PaymentColors[m]}
                      icon={m === 'Efectivo' ? 'cash-outline' : m === 'Tarjeta' ? 'card-outline' : 'phone-portrait-outline'}
                      onPress={() => setPayment(m)}
                    />
                  ))}
                </View>
              </View>
              <Input label="Notas (opcional)" placeholder="Color, medidas, observaciones…" value={notes} onChangeText={setNotes} multiline />
            </Card>

            {/* Resumen */}
            <SectionTitle title="Resumen" />
            <Card>
              <KeyValue label="Subtotal" value={soles(subtotal)} />
              {discountN > 0 ? <KeyValue label="Descuento" value={`- ${soles(discountN)}`} color={Colors.danger} /> : null}
              {deliveryN > 0 ? <KeyValue label="Delivery" value={soles(deliveryN)} /> : null}
              <Divider />
              <KeyValue label="Total" value={soles(total)} bold color={Colors.primary} />
            </Card>
            {validation ? <Text style={styles.validation}>{validation}</Text> : null}
          </ScrollView>

          <View style={styles.footer}>
            <Button title={`Cobrar ${soles(total)}`} icon="checkmark-circle" size="lg" onPress={submit} loading={submitting} disabled={!!validation} />
          </View>
        </KeyboardAvoidingView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.lg, paddingTop: 0, gap: Spacing.sm, paddingBottom: Spacing.xl },
  cartRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: 6 },
  cartName: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.text },
  cartMeta: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  cartTotal: { fontSize: FontSize.md, fontWeight: '800', color: Colors.text },
  label: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.textSecondary },
  paymentRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  suggestions: { backgroundColor: Colors.card, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, marginTop: 6, overflow: 'hidden' },
  suggestion: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border },
  suggestionName: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.text },
  validation: { textAlign: 'center', color: Colors.warning, fontWeight: '600', fontSize: FontSize.sm, marginTop: Spacing.sm },
  footer: { padding: Spacing.lg, paddingTop: Spacing.sm, backgroundColor: Colors.background, borderTopWidth: 1, borderTopColor: Colors.border },
});
