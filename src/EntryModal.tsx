import { ComponentRef, useEffect, useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, KeyboardTypeOptions, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BLUE, GREEN, INK, LINE, RED } from './theme';
import { CATEGORIES, Card, TxType } from './types';
import { addMonths, brl, monthYear, today } from './utils';

export interface EntryValues {
  type: TxType;
  amount: string;
  desc: string;
  category: string;
  installments: string;
  cardId: string | null;
}

interface Props {
  visible: boolean;
  cards: Card[];
  /** when set (a card tab is open) the entry is an expense pinned to this card */
  lockedCard: Card | null;
  onClose: () => void;
  /** returns true when the entry was accepted (the popup then closes) */
  onSubmit: (v: EntryValues) => boolean;
  /** creates the card (or finds the existing one) and returns its id */
  onCreateCard: (name: string) => string | null;
  onRemoveCard: (card: Card) => void;
}

export default function EntryModal({ visible, cards, lockedCard, onClose, onSubmit, onCreateCard, onRemoveCard }: Props) {
  const insets = useSafeAreaInsets();
  const [type, setType] = useState<TxType>('expense');
  const [amount, setAmount] = useState('');
  const [desc, setDesc] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [installments, setInstallments] = useState(''); // empty = 1x (à vista)
  const [cardId, setCardId] = useState<string | null>(null);
  const [newCard, setNewCard] = useState<string | null>(null); // null = not typing a new card

  // Android: the Modal window is not always resized when the keyboard opens, so measure how much
  // of the sheet the keyboard actually covers and lift the sheet by exactly that (0 if already clear).
  const sheetRef = useRef<ComponentRef<typeof View>>(null);
  const [lift, setLift] = useState(0);
  useEffect(() => {
    if (!visible || Platform.OS !== 'android') return;
    const show = Keyboard.addListener('keyboardDidShow', (e) => {
      sheetRef.current?.measureInWindow((_x, y, _w, h) => setLift(Math.max(0, y + h - e.endCoordinates.screenY)));
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => setLift(0));
    return () => {
      show.remove();
      hide.remove();
      setLift(0);
    };
  }, [visible]);

  // every time the popup opens it starts clean (and pinned to the card tab, if any)
  useEffect(() => {
    if (!visible) return;
    setType('expense');
    setAmount('');
    setDesc('');
    setCategory(CATEGORIES[0]);
    setInstallments('');
    setCardId(lockedCard?.id ?? null);
    setNewCard(null);
  }, [visible, lockedCard?.id]);

  const isExpense = type === 'expense';
  const accent = isExpense ? RED : GREEN;
  const nInst = isExpense ? Math.max(1, Math.floor(Number(installments) || 1)) : 1;
  const cents = Math.round(parseFloat(amount.replace(',', '.')) * 100);
  const selectedCard = cardId && cards.some((c) => c.id === cardId) ? cardId : null;
  const dirty = amount !== '' || desc !== '';

  const createCard = () => {
    const name = (newCard ?? '').trim();
    if (name) {
      const id = onCreateCard(name);
      if (id) setCardId(id);
    }
    setNewCard(null);
  };

  const submit = () => {
    if (onSubmit({ type, amount, desc, category, installments, cardId: lockedCard ? lockedCard.id : selectedCard })) onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[s.backdrop, { paddingBottom: lift }]}>
        {/* tapping outside closes, unless something was typed (then it just hides the keyboard) */}
        <Pressable style={s.backdropTap} onPress={() => (dirty ? Keyboard.dismiss() : onClose())} />

        <View ref={sheetRef} style={[s.sheet, { paddingBottom: 12 + insets.bottom }]}>
          <View style={s.header}>
            <Text style={s.title}>{lockedCard ? `Novo gasto · ${lockedCard.name}` : 'Novo lançamento'}</Text>
            <Pressable onPress={onClose} hitSlop={12} style={s.closeBtn} accessibilityLabel="Fechar">
              <Text style={s.closeText}>✕</Text>
            </Pressable>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.body}>
            {!lockedCard && (
              <View>
                <Text style={s.label}>Tipo do lançamento</Text>
                <View style={s.typeRow}>
                  <TypeButton title="Gasto" hint="Dinheiro que saiu" color={RED} selected={isExpense} onPress={() => setType('expense')} />
                  <TypeButton title="Receita" hint="Dinheiro que entrou" color={GREEN} selected={!isExpense} onPress={() => setType('income')} />
                </View>
              </View>
            )}

            <View style={s.row}>
              <Field label={nInst > 1 ? 'Valor total' : 'Valor'} prefix="R$" placeholder="0,00" keyboardType="decimal-pad" value={amount} onChangeText={setAmount} autoFocus style={{ flex: 1 }} big />
              {isExpense && (
                <Field
                  label="Parcelas"
                  suffix="x"
                  placeholder="1"
                  keyboardType="number-pad"
                  maxLength={2}
                  value={installments}
                  onChangeText={(v) => setInstallments(v.replace(/\D/g, ''))}
                  style={{ width: 104 }}
                  big
                />
              )}
            </View>
            {nInst > 1 && Number.isFinite(cents) && cents >= nInst && (
              <Text style={s.preview}>
                {nInst}x de {brl(Math.floor(cents / nInst))} · {monthYear(today())} a {monthYear(addMonths(today(), nInst - 1))}
              </Text>
            )}

            <Field label="Descrição (opcional)" placeholder="Ex.: mercado, salário, uber…" value={desc} onChangeText={setDesc} />

            <View>
              <Text style={s.label}>Categoria</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                {CATEGORIES.map((c) => (
                  <Pressable key={c} onPress={() => setCategory(c)} style={[s.chip, category === c && { backgroundColor: INK, borderColor: INK }]}>
                    <Text style={[s.chipText, category === c && s.chipTextOn]}>{c}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            {isExpense && !lockedCard && (
              <View>
                <Text style={s.label}>Cartão</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ alignItems: 'center' }}>
                  <Pressable onPress={() => setCardId(null)} style={[s.chip, selectedCard === null && { backgroundColor: INK, borderColor: INK }]}>
                    <Text style={[s.chipText, selectedCard === null && s.chipTextOn]}>Nenhum</Text>
                  </Pressable>
                  {cards.map((c) => (
                    <Pressable
                      key={c.id}
                      onPress={() => setCardId(c.id)}
                      onLongPress={() => onRemoveCard(c)}
                      style={[s.chip, selectedCard === c.id && { backgroundColor: INK, borderColor: INK }]}
                    >
                      <Text style={[s.chipText, selectedCard === c.id && s.chipTextOn]}>💳 {c.name}</Text>
                    </Pressable>
                  ))}
                  {newCard === null ? (
                    <Pressable onPress={() => setNewCard('')} style={[s.chip, { borderColor: BLUE, borderStyle: 'dashed' }]}>
                      <Text style={[s.chipText, { color: BLUE, fontWeight: '700' }]}>+ Novo cartão</Text>
                    </Pressable>
                  ) : (
                    <View style={s.newCardBox}>
                      <TextInput
                        autoFocus
                        style={s.newCardInput}
                        placeholder="Nome do cartão"
                        placeholderTextColor="#94a3b8"
                        value={newCard}
                        onChangeText={setNewCard}
                        onSubmitEditing={createCard}
                        returnKeyType="done"
                      />
                      <Pressable onPress={createCard} hitSlop={8}>
                        <Text style={{ color: BLUE, fontWeight: '800' }}>OK</Text>
                      </Pressable>
                    </View>
                  )}
                </ScrollView>
                {cards.length > 0 && <Text style={s.help}>Segure um cartão para removê-lo.</Text>}
              </View>
            )}
          </ScrollView>

          <View style={s.actions}>
            <Pressable onPress={onClose} style={[s.btn, s.btnGhost]}>
              <Text style={s.btnGhostText}>Cancelar</Text>
            </Pressable>
            <Pressable onPress={submit} style={[s.btn, { backgroundColor: accent, flex: 2 }]}>
              <Text style={s.btnText}>{isExpense ? 'Adicionar gasto' : 'Adicionar receita'}</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function TypeButton({ title, hint, color, selected, onPress }: { title: string; hint: string; color: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={[s.typeBtn, selected ? { backgroundColor: color, borderColor: color } : { borderColor: LINE }]}
    >
      <View style={[s.radio, selected ? { backgroundColor: '#fff', borderColor: '#fff' } : { borderColor: '#94a3b8' }]}>
        {selected && <Text style={[s.radioCheck, { color }]}>✓</Text>}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[s.typeTitle, selected && { color: '#fff' }]}>{title}</Text>
        <Text style={[s.typeHint, selected && { color: '#ffffffcc' }]}>{hint}</Text>
      </View>
    </Pressable>
  );
}

interface FieldProps {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  maxLength?: number;
  prefix?: string;
  suffix?: string;
  autoFocus?: boolean;
  big?: boolean;
  style?: object;
}

// bordered, labelled input; the border turns blue while it is being edited
function Field({ label, prefix, suffix, big, style, ...input }: FieldProps) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={style}>
      <Text style={s.label}>{label}</Text>
      <View style={[s.field, focused && s.fieldFocus]}>
        {prefix && <Text style={s.affix}>{prefix}</Text>}
        <TextInput
          {...input}
          placeholderTextColor="#94a3b8"
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={[s.fieldInput, big && s.fieldInputBig]}
        />
        {suffix && <Text style={s.affix}>{suffix}</Text>}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,23,42,0.55)' },
  backdropTap: { flex: 1 },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 18, borderTopRightRadius: 18, maxHeight: '92%', paddingTop: 6 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10 },
  title: { fontSize: 18, fontWeight: '800', color: INK, flex: 1 },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#e2e8f0', alignItems: 'center', justifyContent: 'center' },
  closeText: { fontSize: 14, fontWeight: '800', color: '#334155' },
  body: { paddingHorizontal: 16, paddingBottom: 8, gap: 14 },
  row: { flexDirection: 'row', gap: 10 },
  label: { fontSize: 13, fontWeight: '700', color: '#334155', marginBottom: 6 },
  help: { fontSize: 11, color: '#94a3b8', marginTop: 6 },

  typeRow: { flexDirection: 'row', gap: 10 },
  typeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 2, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 12, backgroundColor: '#fff', elevation: 1 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioCheck: { fontSize: 13, fontWeight: '900', marginTop: -1 },
  typeTitle: { fontSize: 16, fontWeight: '800', color: INK },
  typeHint: { fontSize: 11, color: '#64748b', marginTop: 1 },

  field: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: '#94a3b8', borderRadius: 10, backgroundColor: '#fff', paddingHorizontal: 12, minHeight: 50 },
  fieldFocus: { borderColor: BLUE, backgroundColor: '#f8fbff' },
  fieldInput: { flex: 1, fontSize: 16, color: INK, paddingVertical: 8 },
  fieldInputBig: { fontSize: 20, fontWeight: '700' },
  affix: { fontSize: 15, fontWeight: '700', color: '#64748b', marginHorizontal: 4 },

  preview: { fontSize: 13, fontWeight: '700', color: '#b45309', backgroundColor: '#fffbeb', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, marginTop: -4 },

  chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, borderWidth: 1.5, borderColor: LINE, backgroundColor: '#fff', marginRight: 8 },
  chipText: { fontSize: 14, color: '#334155', fontWeight: '600' },
  chipTextOn: { color: '#fff', fontWeight: '800' },
  newCardBox: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderColor: BLUE, borderRadius: 20, paddingHorizontal: 14, backgroundColor: '#fff' },
  newCardInput: { minWidth: 130, fontSize: 14, paddingVertical: 6, color: INK },

  actions: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#e2e8f0' },
  btn: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 12, paddingVertical: 14 },
  btnGhost: { borderWidth: 1.5, borderColor: LINE, backgroundColor: '#fff' },
  btnGhostText: { fontSize: 15, fontWeight: '700', color: '#334155' },
  btnText: { fontSize: 15, fontWeight: '800', color: '#fff' },
});
