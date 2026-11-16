import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Pressable, ScrollView, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { exportBackup, pickBackup } from './src/backup';
import CardModal, { CardValues } from './src/CardModal';
import EntryModal, { EntryValues } from './src/EntryModal';
import { applyEdit, buildEntries } from './src/ops';
import { loadData, saveData } from './src/storage';
import { Theme, ThemeContext, darkTheme, lightTheme } from './src/theme';
import { AppData, Card, Transaction, emptyData } from './src/types';
import { MAX_INSTALLMENTS, addMonths, brl, monthLabel, parseMoneyToCents, shiftMonth, shortDate, today } from './src/utils';

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
  const [entryForm, setEntryForm] = useState<{ tx: Transaction | null } | null>(null); // null = closed; tx null = new entry
  const [cardForm, setCardForm] = useState<{ card: Card | null } | null>(null); // null = closed; card null = new
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  // theme: the saved choice wins, otherwise follow the device
  const system = useColorScheme();
  const mode = data?.settings?.theme ?? (system === 'dark' ? 'dark' : 'light');
  const t = mode === 'dark' ? darkTheme : lightTheme;
  const s = useMemo(() => makeStyles(t), [t]);
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(t.bg).catch(() => {});
  }, [t.bg]);

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

  const toggleTheme = () => {
    if (data) persist({ ...data, settings: { ...data.settings, theme: mode === 'dark' ? 'light' : 'dark' } });
  };

  /** Called by the popup. Creates a new entry or applies the edit. Returns true when saved. */
  const saveEntry = (v: EntryValues, editing: Transaction | null): boolean => {
    const cents = parseMoneyToCents(v.amount);
    if (!data || !Number.isFinite(cents) || cents <= 0) {
      Alert.alert('Valor inválido', 'Informe um valor maior que zero.');
      return false;
    }
    // never point at a card that no longer exists (e.g. after restoring a backup)
    const cardId = v.cardId && data.cards.some((c) => c.id === v.cardId) ? v.cardId : undefined;

    if (editing) {
      persist({
        ...data,
        transactions: applyEdit(data.transactions, editing, {
          type: v.type,
          amountCents: cents,
          description: v.desc.trim(),
          category: v.category,
          date: v.date,
          cardId,
        }),
      });
      setMonth(v.date.slice(0, 7));
      return true;
    }

    const times = v.type === 'expense' ? Math.floor(Number(v.installments) || 1) : 1;
    if (times < 1 || times > MAX_INSTALLMENTS) {
      Alert.alert('Parcelas inválidas', `Use de 1 a ${MAX_INSTALLMENTS}.`);
      return false;
    }
    if (Math.floor(cents / times) < 1) {
      Alert.alert('Valor pequeno demais', 'Cada parcela precisa ter pelo menos R$ 0,01.');
      return false;
    }
    const groupId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const created = buildEntries(
      { type: v.type, amountCents: cents, description: v.desc.trim(), category: v.category, date: v.date, cardId, times },
      groupId,
      new Date().toISOString(),
    );
    persist({ ...data, transactions: [...created, ...data.transactions] });
    setMonth(v.date.slice(0, 7)); // jump to the month where the new row lives
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

  /** Registers a new card or updates the one being edited. Returns true when saved. */
  const saveCard = (v: CardValues, editing: Card | null): boolean => {
    if (!data) return false;
    if (data.cards.some((c) => c.id !== editing?.id && c.name.toLowerCase() === v.name.toLowerCase())) {
      Alert.alert('Cartão repetido', `Já existe um cartão chamado "${v.name}".`);
      return false;
    }
    const limitCents = v.limitCents ?? undefined;
    if (editing) {
      persist({ ...data, cards: data.cards.map((c) => (c.id === editing.id ? { ...c, name: v.name, limitCents } : c)) });
    } else {
      const card: Card = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name: v.name, limitCents };
      persist({ ...data, cards: [...data.cards, card] });
      setTab(card.id);
    }
    return true;
  };

  const removeCard = (card: Card, onDone?: () => void) => {
    if (!data) return;
    if (data.transactions.some((tx) => tx.cardId === card.id))
      return Alert.alert('Cartão em uso', `"${card.name}" tem lançamentos e não pode ser removido.`);
    Alert.alert(`Remover "${card.name}"?`, undefined, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: () => {
          persist({ ...data, cards: data.cards.filter((c) => c.id !== card.id) });
          onDone?.();
        },
      },
    ]);
  };

  const remove = (tx: Transaction, onDone?: () => void) => {
    if (!data) return;
    const only = () => {
      persist({ ...data, transactions: data.transactions.filter((x) => x.id !== tx.id) });
      onDone?.();
    };
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
        onPress: () => {
          persist({ ...data, transactions: data.transactions.filter((x) => x.installment?.groupId !== inst.groupId) });
          onDone?.();
        },
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
        .filter((x) => x.date.startsWith(month))
        .sort((a, b) => (a.date === b.date ? b.createdAt.localeCompare(a.createdAt) : b.date.localeCompare(a.date))),
    [data, month],
  );

  const totals = useMemo(() => {
    let income = 0;
    let expense = 0;
    rows.forEach((x) => (x.type === 'income' ? (income += x.amountCents) : (expense += x.amountCents)));
    return { income, expense, balance: income - expense };
  }, [rows]);

  // active tab: falls back to "Geral" if its card is gone
  const activeCard = data?.cards.find((c) => c.id === tab) ?? null;
  const onCard = activeCard !== null;
  const tabRows = useMemo(() => (activeCard ? rows.filter((x) => x.cardId === activeCard.id) : rows), [rows, activeCard]);
  const cardSpend = tabRows.reduce((sum, x) => (x.type === 'expense' ? sum + x.amountCents : sum), 0);

  // Limit usage. The app has no notion of "paid", so everything from the current month on counts as
  // committed (future installments included); invoices of past months are assumed to be paid.
  const limit = useMemo(() => {
    if (!activeCard?.limitCents || !data) return null;
    const from = today().slice(0, 7);
    const used = data.transactions.reduce(
      (sum, x) => (x.type === 'expense' && x.cardId === activeCard.id && x.date.slice(0, 7) >= from ? sum + x.amountCents : sum),
      0,
    );
    const total = activeCard.limitCents;
    return { total, used, available: total - used, pct: Math.max(0, Math.min(1, used / total)) };
  }, [data, activeCard]);

  if (!data)
    return (
      <SafeAreaView style={s.center}>
        <Text style={{ color: t.text }}>Carregando…</Text>
      </SafeAreaView>
    );

  return (
    <ThemeContext.Provider value={t}>
      <SafeAreaView style={s.container} edges={['top', 'left', 'right', 'bottom']}>
        <StatusBar style={t.dark ? 'light' : 'dark'} />

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
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={s.tabScroll}>
            {[{ id: 'all', label: 'Geral' }, ...data.cards.map((c) => ({ id: c.id, label: `💳 ${c.name}` }))].map((item) => {
              const on = (activeCard?.id ?? 'all') === item.id;
              return (
                <Pressable key={item.id} onPress={() => setTab(item.id)} style={[s.tab, on && s.tabOn]}>
                  <Text style={[s.tabText, on && s.tabTextOn]} numberOfLines={1}>
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
            <Pressable onPress={() => setCardForm({ card: null })} style={[s.tab, s.tabAdd]} accessibilityLabel="Cadastrar cartão">
              <Text style={[s.tabText, { color: t.link }]}>＋ Cartão</Text>
            </Pressable>
          </ScrollView>
        </View>

        {/* Resumo em cartões */}
        {onCard ? (
          <View key="card-summary">
            <View style={s.stats}>
              <Stat s={s} label="Fatura do mês" value={brl(cardSpend)} color={t.red} />
              {limit ? (
                <Stat s={s} label="Limite disponível" value={brl(limit.available)} color={limit.available < 0 ? t.red : limit.pct > 0.8 ? t.amber : t.green} />
              ) : (
                <Stat s={s} label="Lançamentos" value={String(tabRows.length)} color={t.text} />
              )}
            </View>
            {limit ? (
              <View style={s.limitBox}>
                <View style={s.barTrack}>
                  <View style={[s.barFill, { width: `${Math.round(limit.pct * 100)}%`, backgroundColor: limit.available < 0 ? t.red : limit.pct > 0.8 ? t.amber : t.primary }]} />
                </View>
                <Text style={s.limitText}>
                  {brl(limit.used)} comprometidos de {brl(limit.total)} · {Math.round(limit.pct * 100)}%
                </Text>
                <Text style={s.limitNote}>Conta parcelas futuras. Faturas de meses anteriores são consideradas pagas.</Text>
              </View>
            ) : (
              <Pressable onPress={() => setCardForm({ card: activeCard })} style={s.limitBox} hitSlop={6}>
                <Text style={s.limitNote}>Sem limite cadastrado. Toque para informar e ver o limite disponível.</Text>
              </Pressable>
            )}
          </View>
        ) : (
          <View key="all-summary" style={s.stats}>
            <Stat s={s} label="Entradas" value={brl(totals.income)} color={t.green} />
            <Stat s={s} label="Saídas" value={brl(totals.expense)} color={t.red} />
            <Stat s={s} label="Saldo" value={brl(totals.balance)} color={totals.balance >= 0 ? t.green : t.red} />
          </View>
        )}

        {activeCard && (
          <Pressable onPress={() => setCardForm({ card: activeCard })} style={s.editRow} hitSlop={8}>
            <Text style={s.editLink}>✎ Editar cartão</Text>
          </Pressable>
        )}

        {/* Lista de lançamentos */}
        <View style={s.listWrap}>
          <View style={s.listCard}>
            <View style={s.listHead}>
              <Text style={[s.th, { width: 48 }]}>DATA</Text>
              <Text style={[s.th, s.flex1]}>DESCRIÇÃO</Text>
              <Text style={s.th}>VALOR</Text>
            </View>
            <FlatList
              data={tabRows}
              keyExtractor={(x) => x.id}
              style={s.flex1}
              contentContainerStyle={{ paddingBottom: 72 }} // room so the floating button never hides the last row
              ListEmptyComponent={
                <Text style={s.empty}>
                  {activeCard ? `Nenhum gasto no ${activeCard.name} em ${monthLabel(month)}.` : `Nenhum lançamento em ${monthLabel(month)}.`}
                  {'\n'}Toque em “Novo” para adicionar.
                </Text>
              }
              renderItem={({ item }) => {
                const card = item.cardId ? data.cards.find((c) => c.id === item.cardId) : undefined;
                const parts = [
                  item.description ? { k: 'cat', text: item.category, color: t.textMuted } : null,
                  card ? { k: 'card', text: `💳 ${card.name}`, color: t.link } : null,
                  item.installment ? { k: 'inst', text: `Parcela ${item.installment.n}/${item.installment.of}`, color: t.amber } : null,
                ].filter((x): x is { k: string; text: string; color: string } => x !== null);
                return (
                  <Pressable onPress={() => setEntryForm({ tx: item })} onLongPress={() => remove(item)} style={({ pressed }) => [s.row, pressed && { backgroundColor: t.surfaceAlt }]}>
                    <Text style={s.rowDate}>{shortDate(item.date)}</Text>
                    <View style={s.flex1}>
                      <Text style={s.rowTitle} numberOfLines={1}>
                        {item.description || item.category}
                      </Text>
                      {parts.length > 0 && (
                        <Text style={s.rowSub} numberOfLines={2}>
                          {parts.map((x, i) => (
                            <Text key={x.k} style={{ color: x.color }}>
                              {i > 0 ? '  ·  ' : ''}
                              {x.text}
                            </Text>
                          ))}
                        </Text>
                      )}
                    </View>
                    <Text style={[s.rowValue, { color: item.type === 'income' ? t.green : t.red }]} numberOfLines={1}>
                      {item.type === 'income' ? '+' : '−'} {brl(item.amountCents)}
                    </Text>
                  </Pressable>
                );
              }}
            />
            {/* Total, fixo no rodapé do cartão */}
            <View style={s.listFoot}>
              <Text style={s.footLabel}>
                Total · {tabRows.length} {tabRows.length === 1 ? 'linha' : 'linhas'}
              </Text>
              <Text style={[s.footValue, { color: onCard ? t.red : totals.balance >= 0 ? t.green : t.red }]}>{brl(onCard ? cardSpend : totals.balance)}</Text>
            </View>
          </View>

          {/* Botão que abre o popup de novo lançamento */}
          <Pressable style={s.fab} onPress={() => setEntryForm({ tx: null })} accessibilityRole="button" accessibilityLabel="Novo lançamento">
            <Text style={s.fabPlus}>＋</Text>
            <Text style={s.fabText}>{onCard ? 'Novo gasto' : 'Novo'}</Text>
          </Pressable>
        </View>
        <Text style={s.hint}>Toque numa linha para editar · segure para excluir</Text>

        <View style={s.footer}>
          <Pressable style={[s.footBtn, s.bRight]} onPress={() => exportBackup(data).catch((e) => Alert.alert('Erro', String(e?.message ?? e)))}>
            <Text style={s.link}>⬇ Exportar</Text>
          </Pressable>
          <Pressable style={[s.footBtn, s.bRight]} onPress={restore}>
            <Text style={s.link}>⬆ Restaurar</Text>
          </Pressable>
          <Pressable style={s.footBtn} onPress={toggleTheme} accessibilityLabel="Alternar tema claro e escuro">
            <Text style={s.link}>{t.dark ? '☀️ Tema claro' : '🌙 Tema escuro'}</Text>
          </Pressable>
        </View>

        <CardModal
          visible={cardForm !== null}
          card={cardForm?.card ?? null}
          onClose={() => setCardForm(null)}
          onSave={(v) => saveCard(v, cardForm?.card ?? null)}
          onDelete={cardForm?.card ? () => removeCard(cardForm.card!, () => setCardForm(null)) : undefined}
        />
        <EntryModal
          visible={entryForm !== null}
          cards={data.cards}
          lockedCard={activeCard}
          editing={entryForm?.tx ?? null}
          onDelete={entryForm?.tx ? () => remove(entryForm.tx!, () => setEntryForm(null)) : undefined}
          onClose={() => setEntryForm(null)}
          onSubmit={(v) => saveEntry(v, entryForm?.tx ?? null)}
          onCreateCard={createCard}
          onRemoveCard={removeCard}
        />
      </SafeAreaView>
    </ThemeContext.Provider>
  );
}

function Stat({ s, label, value, color, flex = 1 }: { s: ReturnType<typeof makeStyles>; label: string; value: string; color: string; flex?: number }) {
  return (
    <View style={[s.stat, { flex }]}>
      <Text style={s.statLabel}>{label}</Text>
      <Text style={[s.statValue, { color }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
        {value}
      </Text>
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: t.bg },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.bg },
    flex1: { flex: 1 },
    bRight: { borderRightWidth: StyleSheet.hairlineWidth * 2, borderRightColor: t.border },

    topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 10, paddingBottom: 6 },
    title: { fontSize: 19, fontWeight: '800', color: t.text, letterSpacing: -0.3 },
    monthNav: { flexDirection: 'row', alignItems: 'center', backgroundColor: t.surface, borderRadius: 20, borderWidth: 1, borderColor: t.border },
    navBtn: { paddingHorizontal: 12, paddingVertical: 4 },
    navArrow: { fontSize: 20, fontWeight: '700', color: t.primary },
    monthText: { fontSize: 12, fontWeight: '700', color: t.text, minWidth: 100, textAlign: 'center' },

    tabBar: { paddingVertical: 6 },
    tabScroll: { paddingHorizontal: 16, gap: 8 },
    tab: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, maxWidth: 190 },
    tabOn: { backgroundColor: t.primary, borderColor: t.primary },
    tabAdd: { borderColor: t.link, borderStyle: 'dashed', backgroundColor: 'transparent' },
    tabText: { fontSize: 13, fontWeight: '600', color: t.textMuted },
    tabTextOn: { color: t.onPrimary, fontWeight: '800' },

    stats: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginTop: 6 },
    stat: { backgroundColor: t.surface, borderRadius: 16, borderWidth: 1, borderColor: t.border, paddingHorizontal: 12, paddingVertical: 11 },
    statLabel: { fontSize: 11, fontWeight: '700', color: t.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
    statValue: { fontSize: 16, fontWeight: '800', marginTop: 4 },

    limitBox: { paddingHorizontal: 16, marginTop: 10 },
    barTrack: { height: 8, borderRadius: 4, backgroundColor: t.surfaceAlt, overflow: 'hidden' },
    barFill: { height: 8, borderRadius: 4 },
    limitText: { fontSize: 12, fontWeight: '700', color: t.text, marginTop: 6 },
    limitNote: { fontSize: 11, color: t.textMuted, marginTop: 2, lineHeight: 15 },
    editRow: { alignSelf: 'flex-end', paddingHorizontal: 16, paddingTop: 8 },
    editLink: { fontSize: 12, fontWeight: '700', color: t.link },

    listWrap: { flex: 1, marginHorizontal: 16, marginTop: 12 },
    listCard: { flex: 1, backgroundColor: t.surface, borderRadius: 18, borderWidth: 1, borderColor: t.border, overflow: 'hidden' },
    listHead: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, backgroundColor: t.surfaceAlt },
    th: { fontSize: 10, fontWeight: '800', color: t.textMuted, letterSpacing: 0.6 },
    row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth * 2, borderBottomColor: t.border },
    rowDate: { width: 48, fontSize: 12, fontWeight: '600', color: t.textMuted },
    rowTitle: { fontSize: 15, fontWeight: '600', color: t.text },
    rowSub: { fontSize: 11, marginTop: 2, color: t.textMuted },
    rowValue: { fontSize: 15, fontWeight: '800', marginLeft: 10 },
    listFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12, backgroundColor: t.surfaceAlt },
    footLabel: { fontSize: 12, fontWeight: '700', color: t.textMuted },
    footValue: { fontSize: 16, fontWeight: '800' },
    empty: { textAlign: 'center', color: t.textFaint, marginTop: 28, paddingHorizontal: 12, lineHeight: 20 },
    hint: { textAlign: 'center', fontSize: 11, color: t.textFaint, paddingVertical: 6 },

    fab: {
      position: 'absolute',
      right: 12,
      bottom: 58,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: t.primary,
      borderRadius: 28,
      paddingHorizontal: 20,
      paddingVertical: 13,
      elevation: 6,
      shadowColor: '#000',
      shadowOpacity: 0.25,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 3 },
    },
    fabPlus: { color: t.onPrimary, fontSize: 18, fontWeight: '800', marginTop: -1 },
    fabText: { color: t.onPrimary, fontSize: 15, fontWeight: '800' },

    footer: { flexDirection: 'row', backgroundColor: t.surface, borderTopWidth: 1, borderTopColor: t.border },
    footBtn: { flex: 1, alignItems: 'center', paddingVertical: 12 },
    link: { color: t.link, fontWeight: '700', fontSize: 13 },
  });
