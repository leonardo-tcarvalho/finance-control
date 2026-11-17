import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Field, { Label } from './Field';
import Sheet from './Sheet';
import { Theme, useTheme } from './theme';
import { Card, Categories, DEFAULT_CATEGORIES, INCOME_CATEGORY, METHODS, Method, Transaction, TxType, categoriesFor } from './types';
import { MAX_INSTALLMENTS, MAX_RECURRING, addDays, addMonths, brl, centsToField, formatDateBR, maskDate, monthYear, parseDateBR, parseMoneyToCents, today } from './utils';

export type Repeat = 'once' | 'installment' | 'recurring';

export interface EntryValues {
  type: TxType;
  amount: string;
  desc: string;
  /** ISO yyyy-mm-dd of the purchase (first installment) */
  date: string;
  category: string;
  /** once = a single row; installment = total split over N months; recurring = same amount for N months */
  repeat: Repeat;
  times: string;
  /** installments already paid before registering the purchase ('' = none) */
  paidInstallments: string;
  cardId: string | null;
  method: Method | null;
  /** ISO vencimento, or '' when not informed (the entry date then applies) */
  due: string;
}

interface Props {
  visible: boolean;
  cards: Card[];
  categories: Categories;
  onAddCategory: (kind: 'expense' | 'income', name: string) => void;
  onRemoveCategory: (kind: 'expense' | 'income', name: string) => void;
  /** when set (a card tab is open) the entry is an expense pinned to this card */
  lockedCard: Card | null;
  /** when set the popup edits this entry instead of creating a new one */
  editing: Transaction | null;
  /** only offered when editing */
  onDelete?: () => void;
  onClose: () => void;
  /** returns true when the entry was accepted (the popup then closes) */
  onSubmit: (v: EntryValues) => boolean;
  /** opens the full card form (limit, closing and due day are required); the new card's id comes back through `onCreated` */
  onNewCard: (onCreated: (id: string) => void) => void;
  onRemoveCard: (card: Card) => void;
}

export default function EntryModal({ visible, cards, categories, onAddCategory, onRemoveCategory, lockedCard: pinned, editing, onDelete, onClose, onSubmit, onNewCard, onRemoveCard }: Props) {
  // a pinned card only applies to new entries; editing shows every control so the card can be changed
  const lockedCard = editing ? null : pinned;
  const inst = editing?.installment ?? editing?.recurring;
  const t = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);
  const [type, setType] = useState<TxType>('expense');
  const [amount, setAmount] = useState('');
  const [desc, setDesc] = useState('');
  const [dateText, setDateText] = useState(formatDateBR(today()));
  const [dueText, setDueText] = useState('');
  const [category, setCategory] = useState(DEFAULT_CATEGORIES.expense[0]);
  const [newCategory, setNewCategory] = useState<string | null>(null); // null = not typing a new category
  const [repeat, setRepeat] = useState<Repeat>('once');
  const [times, setTimes] = useState('');
  const [paidText, setPaidText] = useState('');
  const [cardId, setCardId] = useState<string | null>(null);
  const [method, setMethod] = useState<Method | null>(null);

  // every time the popup opens it starts clean (and pinned to the card tab, if any)
  useEffect(() => {
    if (!visible) return;
    if (editing) {
      setType(editing.type);
      setAmount(centsToField(editing.amountCents));
      setDesc(editing.description);
      setDateText(formatDateBR(editing.date));
      setDueText(editing.due ? formatDateBR(editing.due) : '');
      setCategory(editing.category);
      setNewCategory(null);
      setRepeat('once');
      setTimes('');
      setPaidText('');
      setCardId(editing.cardId ?? null);
      setMethod(editing.method ?? null);
      return;
    }
    setType('expense');
    setAmount('');
    setDesc('');
    setDateText(formatDateBR(today()));
    setDueText('');
    setCategory(categories.expense[0] ?? '');
    setNewCategory(null);
    setRepeat('once');
    setTimes('');
    setPaidText('');
    setCardId(lockedCard?.id ?? null);
    setMethod(null);
  }, [visible, lockedCard?.id, editing?.id]);

  const startDate = parseDateBR(dateText) ?? today();
  const kind = 'expense' as const; // only expenses have categories to choose from
  const catList = categoriesFor(categories, type, editing && editing.type === type ? editing.category : undefined);
  // the chosen category must belong to the list shown for this type
  const selectedCategory = catList.includes(category) ? category : (catList[0] ?? '');
  const isExpense = type === 'expense';
  const accent = isExpense ? t.redStrong : t.greenStrong;
  // installments and monthly repetition exist only for expenses; income is always a single entry
  const effRepeat: Repeat = repeat !== 'once' && !isExpense ? 'once' : repeat;
  const nTimes = effRepeat === 'once' ? 1 : Math.max(1, Math.floor(Number(times) || 1));
  // installments already paid: only meaningful for an installment purchase, and at least one must remain
  const paidN = effRepeat === 'installment' ? Math.min(Math.max(0, Math.floor(Number(paidText) || 0)), Math.max(0, nTimes - 1)) : 0;
  const remaining = nTimes - paidN;
  const cents = parseMoneyToCents(amount);
  const selectedCard = cardId && cards.some((c) => c.id === cardId) ? cardId : null;
  const selectedMethod = selectedCard ? null : method;
  // the vencimento is asked for every expense that is not on a card (a card purchase follows its invoice)
  const showDue = type === 'expense' && !lockedCard && !selectedCard;

  const createCategory = () => {
    const name = (newCategory ?? '').trim();
    if (name) {
      onAddCategory(kind, name);
      setCategory(name);
    }
    setNewCategory(null);
  };

  const removeCategory = (name: string) => {
    if ((categories[kind] ?? []).length <= 1) return Alert.alert('Categorias', 'Mantenha pelo menos uma categoria.');
    Alert.alert(`Remover "${name}"?`, 'Os lançamentos que já usam esta categoria continuam com ela.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Remover', style: 'destructive', onPress: () => onRemoveCategory(kind, name) },
    ]);
  };

  const submit = () => {
    const date = parseDateBR(dateText);
    if (!date) return Alert.alert('Data inválida', 'Use o formato DD/MM/AAAA, por exemplo 15/11/2026.');
    if (!isExpense && desc.trim() === '') return Alert.alert('Descrição obrigatória', 'Escreva o que é esta receita, por exemplo: salário, venda do notebook.');
    let due = '';
    if (showDue && dueText.trim() !== '') {
      const parsed = parseDateBR(dueText);
      if (!parsed) return Alert.alert('Vencimento inválido', 'Use o formato DD/MM/AAAA, ou deixe em branco para usar a data do lançamento.');
      due = parsed;
    }
    if (onSubmit({ type, amount, desc, date, category: isExpense ? selectedCategory : INCOME_CATEGORY, repeat: effRepeat, times, paidInstallments: effRepeat === 'installment' ? paidText : '', cardId: lockedCard ? lockedCard.id : selectedCard, method: lockedCard ? null : selectedMethod, due })) onClose();
  };

  return (
    <Sheet
      visible={visible}
      title={editing ? 'Editar lançamento' : lockedCard ? `Novo gasto · ${lockedCard.name}` : 'Novo lançamento'}
      onClose={onClose}
      dirty={!!editing || amount !== '' || desc !== ''}
      footer={
        <>
          <Pressable onPress={onClose} style={[s.btn, s.btnGhost]} accessibilityRole="button">
            <Text style={s.btnGhostText}>Cancelar</Text>
          </Pressable>
          <Pressable onPress={submit} style={[s.btn, { backgroundColor: accent, flex: 2 }]} accessibilityRole="button">
            <Text style={s.btnText}>{editing ? 'Salvar alterações' : isExpense ? 'Adicionar gasto' : 'Adicionar receita'}</Text>
          </Pressable>
        </>
      }
    >
      {inst && (
        <Text style={s.note}>
          {editing?.recurring ? 'Lançamento recorrente' : 'Compra parcelada'} · {inst.n}/{inst.of}. Descrição, categoria e pagamento valem para todos; valor, data e vencimento valem só para este.
        </Text>
      )}

      {!lockedCard && !inst && (
        <View>
          <Label>Tipo do lançamento</Label>
          <View style={s.typeRow}>
            <TypeButton title="Gasto" hint="Dinheiro que saiu" color={t.redStrong} selected={isExpense} onPress={() => setType('expense')} />
            <TypeButton title="Receita" hint="Dinheiro que entrou" color={t.greenStrong} selected={type === 'income'} onPress={() => setType('income')} />
          </View>
        </View>
      )}

      <Field
        label={inst ? (editing?.recurring ? 'Valor deste mês' : 'Valor desta parcela') : effRepeat === 'installment' ? 'Valor total' : effRepeat === 'recurring' ? 'Valor por mês' : 'Valor'}
        prefix="R$"
        placeholder="0,00"
        keyboardType="decimal-pad"
        value={amount}
        onChangeText={setAmount}
        autoFocus
        big
      />

      {!editing && isExpense && (
        <View>
          <Label>Repetição</Label>
          <View style={s.repeatRow}>
            <Pressable onPress={() => setRepeat('once')} style={[s.chip, effRepeat === 'once' && s.chipOn]} accessibilityRole="radio" accessibilityState={{ checked: effRepeat === 'once' }}>
              <Text style={[s.chipText, effRepeat === 'once' && s.chipTextOn]}>Uma vez</Text>
            </Pressable>
            {isExpense && (
              <Pressable onPress={() => setRepeat('installment')} style={[s.chip, effRepeat === 'installment' && s.chipOn]} accessibilityRole="radio" accessibilityState={{ checked: effRepeat === 'installment' }}>
                <Text style={[s.chipText, effRepeat === 'installment' && s.chipTextOn]}>Parcelado</Text>
              </Pressable>
            )}
            {isExpense && (
              <Pressable onPress={() => setRepeat('recurring')} style={[s.chip, effRepeat === 'recurring' && s.chipOn]} accessibilityRole="radio" accessibilityState={{ checked: effRepeat === 'recurring' }}>
                <Text style={[s.chipText, effRepeat === 'recurring' && s.chipTextOn]}>Recorrente</Text>
              </Pressable>
            )}
          </View>
          {effRepeat === 'installment' && <Text style={s.help}>O valor informado é o total e é dividido entre os meses.</Text>}
          {effRepeat === 'recurring' && <Text style={s.help}>O mesmo valor se repete todo mês: boleto parcelado, aluguel, assinatura.</Text>}
        </View>
      )}

      {effRepeat !== 'once' && (
        <Field
          label={effRepeat === 'recurring' ? 'Por quantos meses' : 'Número de parcelas'}
          suffix={effRepeat === 'recurring' ? 'meses' : 'x'}
          placeholder="Ex.: 6"
          keyboardType="number-pad"
          maxLength={2}
          value={times}
          onChangeText={(v) => setTimes(v.replace(/\D/g, ''))}
          style={{ width: 190 }}
        />
      )}
      {effRepeat === 'installment' && !editing && (
        <View>
          <Field
            label="Parcelas já pagas (opcional)"
            suffix="pagas"
            placeholder="0"
            keyboardType="number-pad"
            maxLength={2}
            value={paidText}
            onChangeText={(v) => setPaidText(v.replace(/\D/g, ''))}
            style={{ width: 230 }}
          />
          <Text style={s.help}>Se a compra já estava em andamento, diga quantas já foram pagas. O app cria só as que faltam, e a data abaixo passa a ser a da próxima parcela.</Text>
        </View>
      )}
      {nTimes > 1 && Number.isFinite(cents) && cents >= nTimes && effRepeat === 'installment' && (
        <Text style={s.preview}>
          {paidN > 0 ? `Faltam ${remaining} de ${nTimes}` : `${nTimes}x`} de {brl(Math.floor(cents / nTimes))} · {monthYear(startDate)} a {monthYear(addMonths(startDate, remaining - 1))}
        </Text>
      )}
      {nTimes > 1 && Number.isFinite(cents) && cents > 0 && effRepeat === 'recurring' && (
        <Text style={s.preview}>
          {nTimes} meses de {brl(cents)} (total {brl(cents * nTimes)}) · {monthYear(startDate)} a {monthYear(addMonths(startDate, nTimes - 1))}
        </Text>
      )}

      <Field
        label={isExpense ? 'Descrição (opcional)' : 'O que é esta receita?'}
        placeholder={isExpense ? 'Ex.: mercado, uber, farmácia…' : 'Ex.: salário, venda do notebook, freelance…'}
        value={desc}
        onChangeText={setDesc}
      />

      <View style={s.dateRow}>
        <Field label={paidN > 0 ? 'Data da próxima parcela' : 'Data'} placeholder="DD/MM/AAAA" keyboardType="number-pad" maxLength={10} value={dateText} onChangeText={(v) => setDateText(maskDate(v))} style={{ flex: 1 }} />
        <Pressable onPress={() => setDateText(formatDateBR(today()))} style={s.quick}>
          <Text style={s.quickText}>Hoje</Text>
        </Pressable>
        <Pressable onPress={() => setDateText(formatDateBR(addDays(today(), -1)))} style={s.quick}>
          <Text style={s.quickText}>Ontem</Text>
        </Pressable>
      </View>

      {showDue && (
        <View>
          <Field label="Vencimento (opcional)" placeholder="DD/MM/AAAA" keyboardType="number-pad" maxLength={10} value={dueText} onChangeText={(v) => setDueText(maskDate(v))} />
          <Text style={s.help}>
            Em branco, vale a data do lançamento. {effRepeat !== 'once' ? 'É o vencimento do primeiro mês; os outros seguem de mês em mês. ' : ''}Se passar sem ser pago, a linha fica vermelha.
          </Text>
        </View>
      )}

      {isExpense && (
        <View>
          <Label>Categoria</Label>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ alignItems: 'center' }}>
            {catList.map((c) => (
              <Pressable key={c} onPress={() => setCategory(c)} onLongPress={() => removeCategory(c)} style={[s.chip, selectedCategory === c && s.chipOn]} accessibilityRole="radio" accessibilityState={{ checked: selectedCategory === c }}>
                <Text style={[s.chipText, selectedCategory === c && s.chipTextOn]}>{c}</Text>
              </Pressable>
            ))}
            {newCategory === null ? (
              <Pressable onPress={() => setNewCategory('')} style={[s.chip, { borderColor: t.link, borderStyle: 'dashed' }]}>
                <Text style={[s.chipText, { color: t.link, fontWeight: '700' }]}>+ Nova</Text>
              </Pressable>
            ) : (
              <View style={s.newCardBox}>
                <TextInput
                  autoFocus
                  style={s.newCardInput}
                  placeholder="Nome da categoria"
                  placeholderTextColor={t.textFaint}
                  value={newCategory}
                  onChangeText={setNewCategory}
                  onSubmitEditing={createCategory}
                  returnKeyType="done"
                />
                <Pressable onPress={createCategory} hitSlop={8}>
                  <Text style={{ color: t.link, fontWeight: '800' }}>OK</Text>
                </Pressable>
              </View>
            )}
          </ScrollView>
          <Text style={s.help}>Segure uma categoria para removê-la.</Text>
        </View>
      )}

      {isExpense && !lockedCard && (
        <View>
          <Label>Pagamento</Label>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ alignItems: 'center' }}>
            <Pressable
              onPress={() => {
                setCardId(null);
                setMethod(null);
              }}
              style={[s.chip, selectedCard === null && selectedMethod === null && s.chipOn]}
              accessibilityRole="radio"
              accessibilityState={{ checked: selectedCard === null && selectedMethod === null }}
            >
              <Text style={[s.chipText, selectedCard === null && selectedMethod === null && s.chipTextOn]}>Não informar</Text>
            </Pressable>
            {METHODS.map((m) => (
              <Pressable
                key={m.id}
                onPress={() => {
                  setMethod(m.id);
                  setCardId(null);
                }}
                style={[s.chip, selectedMethod === m.id && s.chipOn]}
                accessibilityRole="radio"
                accessibilityState={{ checked: selectedMethod === m.id }}
              >
                <Text style={[s.chipText, selectedMethod === m.id && s.chipTextOn]}>{m.label}</Text>
              </Pressable>
            ))}
            {cards.map((c) => (
              <Pressable
                key={c.id}
                onPress={() => {
                  setCardId(c.id);
                  setMethod(null);
                }}
                onLongPress={() => onRemoveCard(c)}
                style={[s.chip, selectedCard === c.id && s.chipOn]}
                accessibilityRole="radio"
                accessibilityState={{ checked: selectedCard === c.id }}
              >
                <Text style={[s.chipText, selectedCard === c.id && s.chipTextOn]}>💳 {c.name}</Text>
              </Pressable>
            ))}
            <Pressable
              onPress={() =>
                onNewCard((id) => {
                  setCardId(id);
                  setMethod(null);
                })
              }
              style={[s.chip, { borderColor: t.link, borderStyle: 'dashed' }]}
            >
              <Text style={[s.chipText, { color: t.link, fontWeight: '700' }]}>+ Novo cartão</Text>
            </Pressable>
          </ScrollView>
          {cards.length > 0 && <Text style={s.help}>Segure um cartão para removê-lo.</Text>}
        </View>
      )}

      {editing && onDelete && (
        <Pressable onPress={onDelete} style={s.delete} accessibilityRole="button">
          <Text style={s.deleteText}>Excluir este lançamento</Text>
        </Pressable>
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
      accessibilityState={{ checked: selected }}
      style={[s.typeBtn, selected && { backgroundColor: color, borderColor: color }]}
    >
      <View style={s.typeTop}>
        <View style={[s.radio, selected && { backgroundColor: '#fff', borderColor: '#fff' }]}>{selected && <Text style={[s.radioCheck, { color }]}>✓</Text>}</View>
        <Text style={[s.typeTitle, selected && { color: '#fff' }]} numberOfLines={1}>
          {title}
        </Text>
      </View>
      <Text style={[s.typeHint, selected && { color: '#ffffffcc' }]} numberOfLines={2}>
        {hint}
      </Text>
    </Pressable>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    repeatRow: { flexDirection: 'row' },
    dateRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
    quick: { minHeight: 50, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1.5, borderColor: t.border, backgroundColor: t.surface, alignItems: 'center', justifyContent: 'center' },
    quickText: { fontSize: 14, fontWeight: '700', color: t.link },
    help: { fontSize: 11, color: t.textFaint, marginTop: 6 },

    typeRow: { flexDirection: 'row', gap: 8 },
    typeBtn: { flex: 1, gap: 4, borderWidth: 2, borderColor: t.border, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 10, backgroundColor: t.surface, elevation: 1 },
    typeTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: t.textFaint, alignItems: 'center', justifyContent: 'center' },
    radioCheck: { fontSize: 11, fontWeight: '900', marginTop: -1 },
    typeTitle: { fontSize: 15, fontWeight: '800', color: t.text, flexShrink: 1 },
    typeHint: { fontSize: 10.5, color: t.textMuted, lineHeight: 13 },

    note: { fontSize: 12, lineHeight: 17, color: t.amber, backgroundColor: t.amberSoft, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
    delete: { alignSelf: 'flex-start', paddingVertical: 6 },
    deleteText: { color: t.red, fontWeight: '700', fontSize: 14 },
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
