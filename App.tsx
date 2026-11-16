import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useColorScheme } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { exportBackup, pickBackup } from './src/backup';
import CardModal, { CardValues } from './src/CardModal';
import EntryModal, { EntryValues } from './src/EntryModal';
import { committedOnCard, dueDate, filterRows, invoiceRows, isPaid, monthlySeries, spendByCategory, spendByPayment, spendOf } from './src/calc';
import { applyEdit, buildEntries, groupOf } from './src/ops';
import { loadData, saveData } from './src/storage';
import { dueOf, isOverdue, isPending, monthTotals, movedIntoPaidInvoice, overdueSummary, payKind } from './src/status';
import Summary from './src/Summary';
import { Theme, ThemeContext, darkTheme, lightTheme } from './src/theme';
import { AppData, Card, DEFAULT_CATEGORIES, Transaction, emptyData, methodLabel } from './src/types';
import { MAX_INSTALLMENTS, MAX_RECURRING, addMonths, brl, formatDateBR, monthLabel, parseMoneyToCents, shiftMonth, shortDate, today } from './src/utils';

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
  const [tab, setTab] = useState('all'); // 'all', 'summary' or a card id
  const [query, setQuery] = useState('');
  const [catFilter, setCatFilter] = useState<string | null>(null);
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

  const cats = data?.categories ?? DEFAULT_CATEGORIES;

  const addCategory = (kind: 'expense' | 'income', name: string) => {
    if (!data) return;
    const list = cats[kind];
    if (list.some((c) => c.toLowerCase() === name.toLowerCase())) return; // already there
    persist({ ...data, categories: { ...cats, [kind]: [...list, name] } });
  };

  const removeCategory = (kind: 'expense' | 'income', name: string) => {
    if (!data || cats[kind].length <= 1) return;
    persist({ ...data, categories: { ...cats, [kind]: cats[kind].filter((c) => c !== name) } });
  };

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

    // a purchase cannot be created or moved into an invoice that is already paid
    const refusePaidInvoice = (next: Transaction[]) => {
      const hit = movedIntoPaidInvoice(data.transactions, next, data.cards);
      if (!hit) return false;
      Alert.alert('Fatura já paga', `A fatura de ${monthLabel(hit.month)} do cartão ${hit.card.name} já está paga. Reabra a fatura para lançar nela.`);
      return true;
    };

    if (editing) {
      const next = applyEdit(data.transactions, editing, {
        type: v.type,
        amountCents: cents,
        description: v.desc.trim(),
        category: v.category,
        date: v.date,
        cardId,
        method: v.method ?? undefined,
        due: v.due || undefined,
      });
      if (refusePaidInvoice(next)) return false;
      persist({ ...data, transactions: next });
      setMonth(v.date.slice(0, 7));
      return true;
    }

    // "once" is a single row; otherwise the series needs at least two months
    let times = 1;
    if (v.repeat !== 'once') {
      const max = v.repeat === 'recurring' ? MAX_RECURRING : MAX_INSTALLMENTS;
      times = Math.floor(Number(v.times) || 0);
      if (times < 2 || times > max) {
        Alert.alert(v.repeat === 'recurring' ? 'Meses inválidos' : 'Parcelas inválidas', `Informe de 2 a ${max}.`);
        return false;
      }
    }
    const mode = v.repeat === 'recurring' ? 'recurring' : 'installment';
    if (mode === 'installment' && Math.floor(cents / times) < 1) {
      Alert.alert('Valor pequeno demais', 'Cada parcela precisa ter pelo menos R$ 0,01.');
      return false;
    }
    const groupId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const created = buildEntries(
      { type: v.type, amountCents: cents, description: v.desc.trim(), category: v.category, date: v.date, cardId, method: v.method ?? undefined, due: v.due || undefined, times, mode },
      groupId,
      new Date().toISOString(),
    );
    const next = [...created, ...data.transactions];
    if (refusePaidInvoice(next)) return false;
    persist({ ...data, transactions: next });
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
    const closingDay = v.closingDay ?? undefined;
    const dueDay = v.dueDay ?? undefined;
    if (editing) {
      persist({ ...data, cards: data.cards.map((c) => (c.id === editing.id ? { ...c, name: v.name, limitCents, closingDay, dueDay } : c)) });
    } else {
      const card: Card = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name: v.name, limitCents, closingDay, dueDay };
      persist({ ...data, cards: [...data.cards, card] });
      setTab(card.id);
    }
    return true;
  };

  /** Marks (or reopens) the invoice that closes in `month`. */
  const setInvoicePaid = (card: Card, month: string, paid: boolean) => {
    if (!data) return;
    const list = (card.paid ?? []).filter((m) => m !== month);
    persist({ ...data, cards: data.cards.map((c) => (c.id === card.id ? { ...c, paid: paid ? [...list, month] : list } : c)) });
  };

  /** Toggles a non-card, non-Pix expense between pending and paid. */
  const togglePaid = (tx: Transaction) => {
    if (!data || payKind(tx) !== 'other') return;
    const paid = tx.paid === false; // pending -> paid; paid -> pending again
    persist({ ...data, transactions: data.transactions.map((x) => (x.id === tx.id ? { ...x, paid } : x)) });
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
    const series = tx.installment ?? tx.recurring;
    const gid = groupOf(tx);
    if (!series || !gid) {
      return Alert.alert('Excluir lançamento?', undefined, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Excluir', style: 'destructive', onPress: only },
      ]);
    }
    Alert.alert(
      tx.recurring ? `Excluir mês ${series.n}/${series.of}?` : `Excluir parcela ${series.n}/${series.of}?`,
      tx.recurring ? 'Este lançamento se repete todos os meses.' : 'Esta compra é parcelada.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Só esta', onPress: only },
        {
          text: 'Todas',
          style: 'destructive',
          onPress: () => {
            persist({ ...data, transactions: data.transactions.filter((x) => groupOf(x) !== gid) });
            onDone?.();
          },
        },
      ],
    );
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

  const totals = useMemo(() => monthTotals(rows, data?.cards ?? []), [rows, data]);

  // active tab: falls back to "Geral" if its card is gone
  const activeCard = data?.cards.find((c) => c.id === tab) ?? null;
  const onCard = activeCard !== null;
  // a card tab lists the invoice that closes in the selected month; Geral lists the calendar month
  const tabRows = useMemo(
    () =>
      activeCard
        ? invoiceRows(data?.transactions ?? [], activeCard, month).sort((a, b) => (a.date === b.date ? b.createdAt.localeCompare(a.createdAt) : b.date.localeCompare(a.date)))
        : rows,
    [rows, activeCard, data, month],
  );
  const cardSpend = tabRows.reduce((sum, x) => sum + spendOf(x), 0);

  // search + category chip narrow only the list; the summary cards keep showing the whole month
  const inSummary = tab === 'summary';
  const byCategory = useMemo(() => spendByCategory(rows), [rows]);
  const series = useMemo(() => monthlySeries(data?.transactions ?? [], month, 6), [data, month]);
  const cardNameOf = (id?: string) => data?.cards.find((c) => c.id === id)?.name ?? '';
  const methodNameOf = (m?: string) => (m ? methodLabel(m as never) : '');
  const monthCategories = useMemo(() => Array.from(new Set(tabRows.map((x) => x.category))).sort((a, b) => a.localeCompare(b)), [tabRows]);
  const activeCat = catFilter && monthCategories.includes(catFilter) ? catFilter : null;
  const shownRows = useMemo(
    () => filterRows(tabRows, { query, category: activeCat }, cardNameOf, methodNameOf),
    [tabRows, query, activeCat, data],
  );
  const filtering = query.trim() !== '' || activeCat !== null;
  const shownTotals = monthTotals(shownRows, data?.cards ?? []);
  const byPayment = useMemo(() => spendByPayment(rows, cardNameOf, methodNameOf), [rows, data]);

  // overdue expenses of every month, so a late bill is never hidden in a month that is not on screen
  const overdue = useMemo(() => overdueSummary(data?.transactions ?? [], data?.cards ?? [], today()), [data]);

  const invoicePaid = !!activeCard && isPaid(activeCard, month);
  const invoiceDue = activeCard ? dueDate(activeCard, month) : null;

  // Limit usage (see committedOnCard for what counts as committed).
  const limit = useMemo(() => {
    if (!activeCard?.limitCents || !data) return null;
    const used = committedOnCard(data.transactions, activeCard, today());
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
            {[{ id: 'all', label: 'Geral' }, { id: 'summary', label: '📊 Resumo' }, ...data.cards.map((c) => ({ id: c.id, label: `💳 ${c.name}` }))].map((item) => {
              const on = (inSummary ? 'summary' : (activeCard?.id ?? 'all')) === item.id;
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

        {/* Aviso de vencidos (qualquer mês) */}
        {!onCard && !inSummary && overdue.count > 0 && (
          <Pressable onPress={() => overdue.oldestMonth && setMonth(overdue.oldestMonth)} style={s.alert} accessibilityRole="button" accessibilityLabel="Ver o mais antigo vencido">
            <Text style={s.alertText} numberOfLines={1}>
              ⚠ {overdue.count} {overdue.count === 1 ? 'vencido' : 'vencidos'} · {brl(overdue.cents)}
            </Text>
            <Text style={s.alertGo}>Ver ›</Text>
          </Pressable>
        )}

        {/* Resumo em cartões */}
        {onCard ? (
          <View key="card-summary">
            <View style={s.stats}>
              <Stat s={s} label={invoicePaid ? 'Fatura paga' : 'Fatura do mês'} value={brl(cardSpend)} color={invoicePaid ? t.textMuted : t.red} />
              {limit ? (
                <Stat s={s} label="Limite disponível" value={brl(limit.available)} color={limit.available < 0 ? t.red : limit.pct > 0.8 ? t.amber : t.green} />
              ) : (
                <Stat s={s} label="Lançamentos" value={String(tabRows.length)} color={t.text} />
              )}
            </View>
            <View style={s.invoiceRow}>
              <Text style={s.invoiceInfo} numberOfLines={2}>
                {activeCard!.closingDay ? `Fecha dia ${activeCard!.closingDay}` : 'Fatura = mês do calendário'}
                {invoiceDue ? ` · vence ${formatDateBR(invoiceDue).slice(0, 5)}` : ''}
              </Text>
              {tabRows.length > 0 && (
                <Pressable
                  onPress={() => setInvoicePaid(activeCard!, month, !invoicePaid)}
                  style={[s.paidBtn, invoicePaid && s.paidBtnOn]}
                  accessibilityRole="button"
                  accessibilityLabel={invoicePaid ? 'Reabrir fatura' : 'Marcar fatura como paga'}
                >
                  <Text style={[s.paidBtnText, invoicePaid && s.paidBtnTextOn]}>{invoicePaid ? '✓ Paga · reabrir' : 'Marcar como paga'}</Text>
                </Pressable>
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
                <Text style={s.limitNote}>Conta parcelas futuras e todas as faturas que ainda não foram marcadas como pagas.</Text>
              </View>
            ) : (
              <Pressable onPress={() => setCardForm({ card: activeCard })} style={s.limitBox} hitSlop={6}>
                <Text style={s.limitNote}>Sem limite cadastrado. Toque para informar e ver o limite disponível.</Text>
              </Pressable>
            )}
          </View>
        ) : (
          <View key="all-summary">
            <View style={s.stats}>
              <Stat s={s} label="Receitas" value={brl(totals.income)} color={t.green} />
              <Stat s={s} label="Gastos" value={brl(totals.expense)} color={t.red} sub={totals.pending > 0 ? `${brl(totals.pending)} pendentes` : undefined} />
              <Stat s={s} label="Saldo" value={brl(totals.balance)} color={totals.balance >= 0 ? t.green : t.red} />
            </View>
          </View>
        )}

        {inSummary ? (
          <Summary rows={rows} series={series} byCategory={byCategory} byPayment={byPayment} />
        ) : (
          <>
          {activeCard && (
            <Pressable onPress={() => setCardForm({ card: activeCard })} style={s.editRow} hitSlop={8}>
              <Text style={s.editLink}>✎ Editar cartão</Text>
            </Pressable>
          )}

          {/* Busca e filtro por categoria */}
          {tabRows.length > 0 && (
            <View style={s.searchWrap}>
              <View style={s.searchBox}>
                <Text style={s.searchIcon}>🔎</Text>
                <TextInput
                  style={s.searchInput}
                  placeholder="Buscar por descrição, categoria, cartão…"
                  placeholderTextColor={t.textFaint}
                  value={query}
                  onChangeText={setQuery}
                  returnKeyType="search"
                  autoCorrect={false}
                />
                {query !== '' && (
                  <Pressable onPress={() => setQuery('')} hitSlop={10} accessibilityLabel="Limpar busca">
                    <Text style={s.searchClear}>✕</Text>
                  </Pressable>
                )}
              </View>
              {monthCategories.length > 1 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={s.catRow}>
                  <Pressable onPress={() => setCatFilter(null)} style={[s.catChip, activeCat === null && s.catChipOn]}>
                    <Text style={[s.catChipText, activeCat === null && s.catChipTextOn]}>Todas</Text>
                  </Pressable>
                  {monthCategories.map((c) => (
                    <Pressable key={c} onPress={() => setCatFilter(activeCat === c ? null : c)} style={[s.catChip, activeCat === c && s.catChipOn]}>
                      <Text style={[s.catChipText, activeCat === c && s.catChipTextOn]}>{c}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              )}
            </View>
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
                data={shownRows}
                keyExtractor={(x) => x.id}
                style={s.flex1}
                contentContainerStyle={{ paddingBottom: 72 }} // room so the floating button never hides the last row
                ListEmptyComponent={
                  <Text style={s.empty}>
                    {filtering
                      ? 'Nenhum lançamento encontrado com este filtro.'
                      : activeCard
                        ? `Nenhum gasto no ${activeCard.name} em ${monthLabel(month)}.`
                        : `Nenhum lançamento em ${monthLabel(month)}.`}
                    {filtering ? '' : '\nToque em “Novo” para adicionar.'}
                  </Text>
                }
                renderItem={({ item }) => {
                  const card = item.cardId ? data.cards.find((c) => c.id === item.cardId) : undefined;
                  const kind = payKind(item);
                  const pending = isPending(item, data.cards);
                  const overdue = isOverdue(item, data.cards, today());
                  const due = dueOf(item, data.cards);
                  const parts = [
                    item.description ? { k: 'cat', text: item.category, color: t.textMuted } : null,
                    card ? { k: 'card', text: `💳 ${card.name}`, color: t.link } : null,
                    item.type === 'refund' ? { k: 'refund', text: 'Estorno', color: t.green } : null,
                    !card && item.method ? { k: 'method', text: methodLabel(item.method), color: t.textMuted } : null,
                    item.installment ? { k: 'inst', text: `Parcela ${item.installment.n}/${item.installment.of}`, color: t.amber } : null,
                    item.recurring ? { k: 'rec', text: `Recorrente ${item.recurring.n}/${item.recurring.of}`, color: t.amber } : null,
                    overdue ? { k: 'over', text: 'Vencido', color: t.red } : kind === 'other' && pending ? { k: 'pend', text: 'Pendente', color: t.amber } : null,
                    kind === 'other' && pending && due ? { k: 'due', text: `vence ${shortDate(due)}`, color: overdue ? t.red : t.textMuted } : null,
                  ].filter((x): x is { k: string; text: string; color: string } => x !== null);
                  return (
                    <Pressable
                      onPress={() => setEntryForm({ tx: item })}
                      onLongPress={() => remove(item)}
                      style={({ pressed }) => [s.row, overdue && s.rowOverdue, pressed && { backgroundColor: t.surfaceAlt }]}
                    >
                      {kind === 'other' ? (
                        <Pressable
                          onPress={() => togglePaid(item)}
                          hitSlop={10}
                          style={[s.check, !pending && s.checkOn, overdue && s.checkOver]}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: !pending }}
                          accessibilityLabel={pending ? 'Marcar como pago' : 'Marcar como pendente'}
                        >
                          {!pending && <Text style={s.checkMark}>✓</Text>}
                        </Pressable>
                      ) : (
                        <View style={s.checkSpace} />
                      )}
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
                      <Text style={[s.rowValue, { color: item.type === 'expense' ? t.red : t.green }]} numberOfLines={1}>
                        {item.type === 'expense' ? '−' : '+'} {brl(item.amountCents)}
                      </Text>
                    </Pressable>
                  );
                }}
              />
              {/* Total, fixo no rodapé do cartão */}
              <View style={s.listFoot}>
                <Text style={s.footLabel}>
                  {filtering ? 'Filtrado' : 'Total'} · {shownRows.length} {shownRows.length === 1 ? 'linha' : 'linhas'}
                </Text>
                <Text style={[s.footValue, { color: onCard ? t.red : shownTotals.balance >= 0 ? t.green : t.red }]}>{brl(onCard ? shownTotals.expense : shownTotals.balance)}</Text>
              </View>
            </View>

            {/* Botão que abre o popup de novo lançamento */}
            <Pressable style={s.fab} onPress={() => setEntryForm({ tx: null })} accessibilityRole="button" accessibilityLabel="Novo lançamento">
              <Text style={s.fabPlus}>＋</Text>
              <Text style={s.fabText}>{onCard ? 'Novo gasto' : 'Novo'}</Text>
            </Pressable>
          </View>
          </>
        )}
        {!inSummary && <Text style={s.hint}>Toque para editar · segure para excluir · a bolinha marca como pago</Text>}

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
          categories={cats}
          onAddCategory={addCategory}
          onRemoveCategory={removeCategory}
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

function Stat({ s, label, value, color, flex = 1, sub }: { s: ReturnType<typeof makeStyles>; label: string; value: string; color: string; flex?: number; sub?: string }) {
  return (
    <View style={[s.stat, { flex }]}>
      <Text style={s.statLabel}>{label}</Text>
      <Text style={[s.statValue, { color }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
        {value}
      </Text>
      {sub && (
        <Text style={s.statSub} numberOfLines={2}>
          {sub}
        </Text>
      )}
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

    alert: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 16, marginTop: 8, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: t.red, backgroundColor: t.redSoft },
    alertText: { flex: 1, fontSize: 13, fontWeight: '800', color: t.red },
    alertGo: { fontSize: 13, fontWeight: '800', color: t.red },
    stats: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginTop: 6 },
    stat: { backgroundColor: t.surface, borderRadius: 16, borderWidth: 1, borderColor: t.border, paddingHorizontal: 12, paddingVertical: 11 },
    statLabel: { fontSize: 11, fontWeight: '700', color: t.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
    statSub: { fontSize: 10, fontWeight: '700', color: t.amber, marginTop: 2 },
    statValue: { fontSize: 16, fontWeight: '800', marginTop: 4 },

    invoiceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingHorizontal: 16, marginTop: 10 },
    invoiceInfo: { flex: 1, fontSize: 12, fontWeight: '600', color: t.textMuted },
    paidBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, borderWidth: 1.5, borderColor: t.link },
    paidBtnOn: { backgroundColor: t.greenSoft, borderColor: t.green },
    paidBtnText: { fontSize: 12, fontWeight: '800', color: t.link },
    paidBtnTextOn: { color: t.green },
    limitBox: { paddingHorizontal: 16, marginTop: 10 },
    barTrack: { height: 8, borderRadius: 4, backgroundColor: t.surfaceAlt, overflow: 'hidden' },
    barFill: { height: 8, borderRadius: 4 },
    limitText: { fontSize: 12, fontWeight: '700', color: t.text, marginTop: 6 },
    limitNote: { fontSize: 11, color: t.textMuted, marginTop: 2, lineHeight: 15 },
    editRow: { alignSelf: 'flex-end', paddingHorizontal: 16, paddingTop: 8 },
    editLink: { fontSize: 12, fontWeight: '700', color: t.link },

    searchWrap: { paddingHorizontal: 16, marginTop: 10, gap: 8 },
    searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: t.surface, borderRadius: 14, borderWidth: 1, borderColor: t.border, paddingHorizontal: 12 },
    searchIcon: { fontSize: 14, marginRight: 8 },
    searchInput: { flex: 1, fontSize: 14, color: t.text, paddingVertical: 9 },
    searchClear: { fontSize: 14, fontWeight: '800', color: t.textMuted, paddingLeft: 8 },
    catRow: { gap: 6 },
    catChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: t.border, backgroundColor: t.surface },
    catChipOn: { backgroundColor: t.primarySoft, borderColor: t.primary },
    catChipText: { fontSize: 12, fontWeight: '600', color: t.textMuted },
    catChipTextOn: { color: t.link, fontWeight: '800' },
    listWrap: { flex: 1, marginHorizontal: 16, marginTop: 12 },
    listCard: { flex: 1, backgroundColor: t.surface, borderRadius: 18, borderWidth: 1, borderColor: t.border, overflow: 'hidden' },
    listHead: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, backgroundColor: t.surfaceAlt },
    th: { fontSize: 10, fontWeight: '800', color: t.textMuted, letterSpacing: 0.6 },
    row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth * 2, borderBottomColor: t.border },
    rowOverdue: { backgroundColor: t.redSoft, borderLeftWidth: 4, borderLeftColor: t.red, paddingLeft: 10 },
    check: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: t.amber, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
    checkOn: { backgroundColor: t.greenStrong, borderColor: t.greenStrong },
    checkOver: { borderColor: t.red },
    checkMark: { color: '#fff', fontSize: 13, fontWeight: '900', marginTop: -1 },
    checkSpace: { width: 34 },
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
