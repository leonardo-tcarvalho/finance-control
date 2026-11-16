import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Field, { Label } from './Field';
import Sheet from './Sheet';
import { Theme, useTheme } from './theme';
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
  const t = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);
  const [type, setType] = useState<TxType>('expense');
  const [amount, setAmount] = useState('');
  const [desc, setDesc] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [installments, setInstallments] = useState(''); // empty = 1x (à vista)
  const [cardId, setCardId] = useState<string | null>(null);
  const [newCard, setNewCard] = useState<string | null>(null); // null = not typing a new card

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
  const accent = isExpense ? t.redStrong : t.greenStrong;
  const nInst = isExpense ? Math.max(1, Math.floor(Number(installments) || 1)) : 1;
  const cents = Math.round(parseFloat(amount.replace(',', '.')) * 100);
  const selectedCard = cardId && cards.some((c) => c.id === cardId) ? cardId : null;

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
    <Sheet
      visible={visible}
      title={lockedCard ? `Novo gasto · ${lockedCard.name}` : 'Novo lançamento'}
      onClose={onClose}
      dirty={amount !== '' || desc !== ''}
      footer={
        <>
          <Pressable onPress={onClose} style={[s.btn, s.btnGhost]}>
            <Text style={s.btnGhostText}>Cancelar</Text>
          </Pressable>
          <Pressable onPress={submit} style={[s.btn, { backgroundColor: accent, flex: 2 }]}>
            <Text style={s.btnText}>{isExpense ? 'Adicionar gasto' : 'Adicionar receita'}</Text>
          </Pressable>
        </>
      }
    >
      {!lockedCard && (
        <View>
          <Label>Tipo do lançamento</Label>
          <View style={s.typeRow}>
            <TypeButton title="Gasto" hint="Dinheiro que saiu" color={t.redStrong} selected={isExpense} onPress={() => setType('expense')} />
            <TypeButton title="Receita" hint="Dinheiro que entrou" color={t.greenStrong} selected={!isExpense} onPress={() => setType('income')} />
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
        <Label>Categoria</Label>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {CATEGORIES.map((c) => (
            <Pressable key={c} onPress={() => setCategory(c)} style={[s.chip, category === c && s.chipOn]}>
              <Text style={[s.chipText, category === c && s.chipTextOn]}>{c}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {isExpense && !lockedCard && (
        <View>
          <Label>Cartão</Label>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ alignItems: 'center' }}>
            <Pressable onPress={() => setCardId(null)} style={[s.chip, selectedCard === null && s.chipOn]}>
              <Text style={[s.chipText, selectedCard === null && s.chipTextOn]}>Nenhum</Text>
            </Pressable>
            {cards.map((c) => (
              <Pressable key={c.id} onPress={() => setCardId(c.id)} onLongPress={() => onRemoveCard(c)} style={[s.chip, selectedCard === c.id && s.chipOn]}>
                <Text style={[s.chipText, selectedCard === c.id && s.chipTextOn]}>💳 {c.name}</Text>
              </Pressable>
            ))}
            {newCard === null ? (
              <Pressable onPress={() => setNewCard('')} style={[s.chip, { borderColor: t.link, borderStyle: 'dashed' }]}>
                <Text style={[s.chipText, { color: t.link, fontWeight: '700' }]}>+ Novo cartão</Text>
              </Pressable>
            ) : (
              <View style={s.newCardBox}>
                <TextInput
                  autoFocus
                  style={s.newCardInput}
                  placeholder="Nome do cartão"
                  placeholderTextColor={t.textFaint}
                  value={newCard}
                  onChangeText={setNewCard}
                  onSubmitEditing={createCard}
                  returnKeyType="done"
                />
                <Pressable onPress={createCard} hitSlop={8}>
                  <Text style={{ color: t.link, fontWeight: '800' }}>OK</Text>
                </Pressable>
              </View>
            )}
          </ScrollView>
          {cards.length > 0 && <Text style={s.help}>Segure um cartão para removê-lo.</Text>}
        </View>
      )}
    </Sheet>
  );
}

function TypeButton({ title, hint, color, selected, onPress }: { title: string; hint: string; color: string; selected: boolean; onPress: () => void }) {
  const t = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={[s.typeBtn, selected && { backgroundColor: color, borderColor: color }]}
    >
      <View style={[s.radio, selected && { backgroundColor: '#fff', borderColor: '#fff' }]}>{selected && <Text style={[s.radioCheck, { color }]}>✓</Text>}</View>
      <View style={{ flex: 1 }}>
        <Text style={[s.typeTitle, selected && { color: '#fff' }]}>{title}</Text>
        <Text style={[s.typeHint, selected && { color: '#ffffffcc' }]}>{hint}</Text>
      </View>
    </Pressable>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    row: { flexDirection: 'row', gap: 10 },
    help: { fontSize: 11, color: t.textFaint, marginTop: 6 },

    typeRow: { flexDirection: 'row', gap: 10 },
    typeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 2, borderColor: t.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 12, backgroundColor: t.surface, elevation: 1 },
    radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: t.textFaint, alignItems: 'center', justifyContent: 'center' },
    radioCheck: { fontSize: 13, fontWeight: '900', marginTop: -1 },
    typeTitle: { fontSize: 16, fontWeight: '800', color: t.text },
    typeHint: { fontSize: 11, color: t.textMuted, marginTop: 1 },

    preview: { fontSize: 13, fontWeight: '700', color: t.amber, backgroundColor: t.amberSoft, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, marginTop: -4 },

    chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, borderWidth: 1.5, borderColor: t.border, backgroundColor: t.surface, marginRight: 8 },
    chipOn: { backgroundColor: t.primary, borderColor: t.primary },
    chipText: { fontSize: 14, color: t.text, fontWeight: '600' },
    chipTextOn: { color: t.onPrimary, fontWeight: '800' },
    newCardBox: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderColor: t.link, borderRadius: 20, paddingHorizontal: 14, backgroundColor: t.surface },
    newCardInput: { minWidth: 130, fontSize: 14, paddingVertical: 6, color: t.text },

    btn: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 12, paddingVertical: 14 },
    btnGhost: { borderWidth: 1.5, borderColor: t.border, backgroundColor: t.surface },
    btnGhostText: { fontSize: 15, fontWeight: '700', color: t.text },
    btnText: { fontSize: 15, fontWeight: '800', color: '#fff' },
  });
