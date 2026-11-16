import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { exportBackup, pickBackup } from './src/backup';
import EntryModal, { EntryValues } from './src/EntryModal';
import { loadData, saveData } from './src/storage';
import { BLUE, GREEN, INK, LINE, RED } from './src/theme';
import { AppData, Card, Transaction, emptyData } from './src/types';
import { MAX_INSTALLMENTS, addMonths, brl, monthLabel, shiftMonth, shortDate, today } from './src/utils';

export default function App() {
  return (
    <SafeAreaProvider>
      <Main />
    </SafeAreaProvider>
  );
}

function Main() {
  const [data, setData] = useState<AppData | null>(null);
  const [month, setMonth] = useState(today().slice(0, 7));
  const [tab, setTab] = useState('all'); // 'all' or a card id
  const [formOpen, setFormOpen] = useState(false);
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    loadData().then(setData).catch(() => setData(emptyData()));
  }, []);

  // serialize writes so concurrent edits never interleave on disk
  const persist = useCallback((next: AppData) => {
    setData(next);
    queue.current = queue.current
      .then(() => saveData(next))
      .catch((e) => Alert.alert('Erro ao salvar', String(e?.message ?? e)));
  }, []);

  /** Called by the popup. Returns true when the entry was saved. */
  const submit = (v: EntryValues): boolean => {
    const cents = Math.round(parseFloat(v.amount.replace(',', '.')) * 100);
    if (!data || !Number.isFinite(cents) || cents <= 0) {
      Alert.alert('Valor inválido', 'Informe um valor maior que zero.');
      return false;
    }
    const n = v.type === 'expense' ? Math.floor(Number(v.installments) || 1) : 1;
    if (n < 1 || n > MAX_INSTALLMENTS) {
      Alert.alert('Parcelas inválidas', `Use de 1 a ${MAX_INSTALLMENTS}.`);
      return false;
    }
    const base = Math.floor(cents / n);
    if (base < 1) {
      Alert.alert('Valor pequeno demais', 'Cada parcela precisa ter pelo menos R$ 0,01.');
      return false;
    }
    const rest = cents - base * n; // leftover cents go to the first installment, so the sum is exact
    const groupId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();
    // never point at a card that no longer exists (e.g. after restoring a backup)
    const cardOk = v.cardId && data.cards.some((c) => c.id === v.cardId) ? v.cardId : undefined;
    const created: Transaction[] = Array.from({ length: n }, (_, i) => ({
      id: `${groupId}-${i + 1}`,
      type: v.type,
      amountCents: base + (i === 0 ? rest : 0),
      category: v.category,
      description: v.desc.trim(),
      date: addMonths(today(), i),
      cardId: v.type === 'expense' ? cardOk : undefined,
      installment: n > 1 ? { n: i + 1, of: n, groupId } : undefined,
      createdAt: now,
    }));
    persist({ ...data, transactions: [...created, ...data.transactions] });
    setMonth(today().slice(0, 7)); // jump to the month where the new row lives
    return true;
  };

  /** Creates the card, or returns the id of an existing one with the same name. */
  const createCard = (name: string): string | null => {
    if (!data) return null;
    const existing = data.cards.find((c) => c.name.toLowerCase() === name.toLowerCase());
    if (existing) return existing.id;
    const card: Card = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name };
    persist({ ...data, cards: [...data.cards, card] });
    return card.id;
  };

  const removeCard = (card: Card) => {
    if (!data) return;
    if (data.transactions.some((t) => t.cardId === card.id))
      return Alert.alert('Cartão em uso', `"${card.name}" tem lançamentos e não pode ser removido.`);
    Alert.alert(`Remover "${card.name}"?`, undefined, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Remover', style: 'destructive', onPress: () => persist({ ...data, cards: data.cards.filter((c) => c.id !== card.id) }) },
    ]);
  };

  const remove = (tx: Transaction) => {
    if (!data) return;
    const only = () => persist({ ...data, transactions: data.transactions.filter((t) => t.id !== tx.id) });
    const inst = tx.installment;
    if (!inst) {
      return Alert.alert('Excluir lançamento?', undefined, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Excluir', style: 'destructive', onPress: only },
      ]);
    }
    Alert.alert(`Excluir parcela ${inst.n}/${inst.of}?`, 'Esta compra é parcelada.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Só esta', onPress: only },
      {
        text: 'Todas',
        style: 'destructive',
        onPress: () => persist({ ...data, transactions: data.transactions.filter((t) => t.installment?.groupId !== inst.groupId) }),
      },
    ]);
  };

  const restore = async () => {
    try {
      const imported = await pickBackup();
      if (!imported || !data) return;
      Alert.alert(
        'Restaurar backup?',
        `Substitui os ${data.transactions.length} lançamentos atuais por ${imported.transactions.length} do arquivo. O estado atual continua nos backups automáticos.`,
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Restaurar', onPress: () => persist(imported) },
        ],
      );
    } catch (e: any) {
      Alert.alert('Arquivo inválido', String(e?.message ?? e));
    }
  };

  const rows = useMemo(
    () =>
      (data?.transactions ?? [])
        .filter((t) => t.date.startsWith(month))
        .sort((a, b) => (a.date === b.date ? b.createdAt.localeCompare(a.createdAt) : b.date.localeCompare(a.date))),
    [data, month],
  );

  const totals = useMemo(() => {
    let income = 0;
    let expense = 0;
    rows.forEach((t) => (t.type === 'income' ? (income += t.amountCents) : (expense += t.amountCents)));
    return { income, expense, balance: income - expense };
  }, [rows]);

  // active tab: falls back to "Geral" if its card is gone
  const activeCard = data?.cards.find((c) => c.id === tab) ?? null;
  const onCard = activeCard !== null;
  const tabRows = useMemo(() => (activeCard ? rows.filter((t) => t.cardId === activeCard.id) : rows), [rows, activeCard]);
  const cardSpend = tabRows.reduce((sum, t) => (t.type === 'expense' ? sum + t.amountCents : sum), 0);

  if (!data)
    return (
      <SafeAreaView style={s.center}>
        <Text>Carregando…</Text>
      </SafeAreaView>
    );

  return (
    <SafeAreaView style={s.container} edges={['top', 'left', 'right', 'bottom']}>
      <StatusBar style="dark" />

      {/* Barra superior: título + seletor de mês */}
      <View style={s.topBar}>
        <Text style={s.title}>Controle de Gastos</Text>
        <View style={s.monthNav}>
          <Pressable hitSlop={8} onPress={() => setMonth(shiftMonth(month, -1))} style={s.navBtn}>
            <Text style={s.navArrow}>‹</Text>
          </Pressable>
          <Text style={s.monthText}>{monthLabel(month)}</Text>
          <Pressable hitSlop={8} onPress={() => setMonth(shiftMonth(month, 1))} style={s.navBtn}>
            <Text style={s.navArrow}>›</Text>
          </Pressable>
        </View>
      </View>

      {/* Menu de navegação: Geral + uma aba por cartão */}
      <View style={s.tabBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {[{ id: 'all', label: 'Geral' }, ...data.cards.map((c) => ({ id: c.id, label: `💳 ${c.name}` }))].map((t) => {
            const on = (activeCard?.id ?? 'all') === t.id;
            return (
              <Pressable key={t.id} onPress={() => setTab(t.id)} style={[s.tab, on && s.tabOn]}>
                <Text style={[s.tabText, on && s.tabTextOn]} numberOfLines={1}>
                  {t.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Resumo: células lado a lado, rótulo em cima e valor embaixo */}
      <View style={[s.grid, { marginTop: 10 }]}>
        {onCard ? (
          <View key="card-summary">
            <View style={s.gridRow}>
              <Text style={[s.hCell, s.flex1, s.bRight]}>FATURA DO MÊS</Text>
              <Text style={[s.hCell, { width: 120 }]}>LANÇAMENTOS</Text>
            </View>
            <View style={s.gridRow}>
              <Text style={[s.vCell, s.flex1, s.bRight, { color: RED }]}>{brl(cardSpend)}</Text>
              <Text style={[s.vCell, { width: 120 }]}>{tabRows.length}</Text>
            </View>
          </View>
        ) : (
          <View key="all-summary">
            <View style={s.gridRow}>
              <Text style={[s.hCell, s.flex1, s.bRight]}>ENTRADAS</Text>
              <Text style={[s.hCell, s.flex1, s.bRight]}>SAÍDAS</Text>
              <Text style={[s.hCell, s.flex1]}>SALDO</Text>
            </View>
            <View style={s.gridRow}>
              <Text style={[s.vCell, s.flex1, s.bRight, { color: GREEN }]}>{brl(totals.income)}</Text>
              <Text style={[s.vCell, s.flex1, s.bRight, { color: RED }]}>{brl(totals.expense)}</Text>
              <Text style={[s.vCell, s.flex1, { color: totals.balance >= 0 ? GREEN : RED }]}>{brl(totals.balance)}</Text>
            </View>
          </View>
        )}
      </View>

      {/* Tabela de lançamentos */}
      <View style={[s.grid, s.table]}>
        <View style={[s.gridRow, s.headRow]}>
          <Text style={[s.hCell, s.cDate, s.bRight]}>DATA</Text>
          <Text style={[s.hCell, s.flex1, s.bRight]}>DESCRIÇÃO</Text>
          <Text style={[s.hCell, s.cCat, s.bRight]}>CATEGORIA</Text>
          <Text style={[s.hCell, s.cVal, s.right]}>VALOR</Text>
        </View>
        <FlatList
          data={tabRows}
          keyExtractor={(t) => t.id}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 72 }} // room so the floating button never hides the last row
          ListEmptyComponent={
            <Text style={s.empty}>
              {activeCard ? `Nenhum gasto no ${activeCard.name} em ${monthLabel(month)}.` : `Nenhum lançamento em ${monthLabel(month)}.`}
              {'\n'}Toque em “Novo” para adicionar.
            </Text>
          }
          renderItem={({ item, index }) => (
            <Pressable onLongPress={() => remove(item)} style={[s.gridRow, s.dataRow, index % 2 === 1 && s.zebra]}>
              <Text style={[s.cell, s.cDate, s.bRight, s.muted]} numberOfLines={1}>
                {shortDate(item.date)}
              </Text>
              <View style={[s.flex1, s.bRight, s.catCell]}>
                <Text style={s.catText} numberOfLines={1}>
                  {item.description || '—'}
                </Text>
                {item.installment && (
                  <Text style={s.instText}>
                    Parcela {item.installment.n}/{item.installment.of}
                  </Text>
                )}
              </View>
              <View style={[s.cCat, s.bRight, s.catCell]}>
                <Text style={[s.catText, s.muted]} numberOfLines={1}>
                  {item.category}
                </Text>
                {item.cardId && (
                  <Text style={s.cardText} numberOfLines={1}>
                    💳 {data.cards.find((c) => c.id === item.cardId)?.name ?? '—'}
                  </Text>
                )}
              </View>
              <Text style={[s.cell, s.cVal, s.right, s.bold, { color: item.type === 'income' ? GREEN : RED }]} numberOfLines={1}>
                {item.type === 'income' ? '+' : '−'} {brl(item.amountCents)}
              </Text>
            </Pressable>
          )}
        />
        {/* Linha de total, fixa no rodapé da tabela */}
        <View style={[s.gridRow, s.totalRow]}>
          <Text style={[s.cell, s.flex1, s.bold]}>
            TOTAL · {tabRows.length} {tabRows.length === 1 ? 'linha' : 'linhas'}
          </Text>
          {onCard ? (
            <Text style={[s.cell, s.right, s.bold, { color: RED }]}>{brl(cardSpend)}</Text>
          ) : (
            <Text style={[s.cell, s.right, s.bold, { color: totals.balance >= 0 ? GREEN : RED }]}>{brl(totals.balance)}</Text>
          )}
        </View>

        {/* Botão que abre o popup de novo lançamento */}
        <Pressable style={s.fab} onPress={() => setFormOpen(true)} accessibilityRole="button" accessibilityLabel="Novo lançamento">
          <Text style={s.fabPlus}>＋</Text>
          <Text style={s.fabText}>{onCard ? 'Novo gasto' : 'Novo'}</Text>
        </Pressable>
      </View>
      <Text style={s.hint}>Segure uma linha para excluir</Text>

      <View style={s.footer}>
        <Pressable style={[s.footBtn, s.bRight]} onPress={() => exportBackup(data).catch((e) => Alert.alert('Erro', String(e?.message ?? e)))}>
          <Text style={s.link}>⬇ Exportar backup</Text>
        </Pressable>
        <Pressable style={s.footBtn} onPress={restore}>
          <Text style={s.link}>⬆ Restaurar backup</Text>
        </Pressable>
      </View>

      <EntryModal
        visible={formOpen}
        cards={data.cards}
        lockedCard={activeCard}
        onClose={() => setFormOpen(false)}
        onSubmit={submit}
        onCreateCard={createCard}
        onRemoveCard={removeCard}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#eef2f7' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  flex1: { flex: 1 },
  right: { textAlign: 'right' },
  bold: { fontWeight: '700' },
  muted: { color: '#64748b' },
  bRight: { borderRightWidth: StyleSheet.hairlineWidth * 2, borderRightColor: LINE },

  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10 },
  title: { fontSize: 18, fontWeight: '800', color: INK },
  monthNav: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 6, borderWidth: 1, borderColor: LINE },
  navBtn: { paddingHorizontal: 10, paddingVertical: 2 },
  navArrow: { fontSize: 20, fontWeight: '700', color: INK },
  monthText: { fontSize: 12, fontWeight: '700', color: INK, minWidth: 104, textAlign: 'center' },

  tabBar: { backgroundColor: '#fff', borderTopWidth: 1, borderBottomWidth: 1, borderColor: LINE },
  tab: { paddingHorizontal: 16, paddingVertical: 11, borderBottomWidth: 3, borderBottomColor: 'transparent', maxWidth: 190 },
  tabOn: { borderBottomColor: INK, backgroundColor: '#f1f5f9' },
  tabText: { fontSize: 13, fontWeight: '600', color: '#64748b' },
  tabTextOn: { color: INK, fontWeight: '800' },

  grid: { marginHorizontal: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: LINE },
  gridRow: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth * 2, borderBottomColor: LINE },
  hCell: { backgroundColor: '#e2e8f0', paddingHorizontal: 8, paddingVertical: 5, fontSize: 10, fontWeight: '800', color: '#475569', letterSpacing: 0.4 },
  vCell: { paddingHorizontal: 8, paddingVertical: 8, fontSize: 15, fontWeight: '800' },

  table: { flex: 1, marginTop: 10 },
  headRow: { borderBottomWidth: 1 },
  dataRow: { alignItems: 'stretch' },
  zebra: { backgroundColor: '#f8fafc' },
  cell: { paddingHorizontal: 8, paddingVertical: 9, fontSize: 13, color: INK },
  cDate: { width: 64 },
  cCat: { width: 92 },
  cVal: { width: 104 },
  cCount: { width: 56 },
  catCell: { paddingHorizontal: 8, paddingVertical: 6, justifyContent: 'center' },
  catText: { fontSize: 13 },
  cardText: { fontSize: 10, color: BLUE, fontWeight: '600', marginTop: 1 },
  instText: { fontSize: 10, color: '#b45309', fontWeight: '700', marginTop: 1 },
  empty: { textAlign: 'center', color: '#94a3b8', marginTop: 24, paddingHorizontal: 12, lineHeight: 20 },
  totalRow: { backgroundColor: '#e2e8f0', borderTopWidth: 1, borderTopColor: '#94a3b8', borderBottomWidth: 0 },
  hint: { textAlign: 'center', fontSize: 11, color: '#94a3b8', paddingVertical: 4 },

  fab: {
    position: 'absolute',
    right: 12,
    bottom: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: INK,
    borderRadius: 28,
    paddingHorizontal: 20,
    paddingVertical: 13,
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  fabPlus: { color: '#fff', fontSize: 18, fontWeight: '800', marginTop: -1 },
  fabText: { color: '#fff', fontSize: 15, fontWeight: '800' },

  footer: { flexDirection: 'row', backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: LINE },
  footBtn: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  link: { color: BLUE, fontWeight: '700', fontSize: 13 },
});
