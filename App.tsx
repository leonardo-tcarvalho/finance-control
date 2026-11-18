import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View, useColorScheme } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { exportBackup, pickBackup, shareRawData } from './src/backup';
import CardModal, { CardValues } from './src/CardModal';
import Drawer, { DrawerDivider, DrawerItem, DrawerSection } from './src/Drawer';
import { PlusIcon, TrayArrow } from './src/Icons';
import RowActions from './src/RowActions';
import EntryModal, { EntryValues } from './src/EntryModal';
import { committedOnCard, gainLabel, gainOf, gainText, portfolioTotals, titleOf, sortCardsByLimit, dueDate, filterRows, invoiceRows, isPaid, monthOf, monthlySeries, spendByCategory, spendByPayment, spendOf } from './src/calc';
import { applyEdit, buildEntries, groupOf, updateCurrentValue } from './src/ops';
import { loadData, saveData, saveRestorePoint } from './src/storage';
import { dueOf, isOverdue, isPending, monthTotals, movedIntoPaidInvoice, overdueSummary, payKind } from './src/status';
import AnnualReport from './src/AnnualReport';
import Summary from './src/Summary';
import { Theme, ThemeContext, darkTheme, lightTheme } from './src/theme';
import { AppData, Card, DEFAULT_CATEGORIES, INVESTMENT_CATEGORY, Transaction, Method, methodLabel } from './src/types';
import { MAX_INSTALLMENTS, MAX_RECURRING, brl, formatDateBR, monthLabel, parseMoneyToCents, shiftMonth, shortDate, today } from './src/utils';

const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const byNewest = (a: Transaction, b: Transaction) => (a.date === b.date ? b.createdAt.localeCompare(a.createdAt) : b.date.localeCompare(a.date));

export default function App() {
  return (
    <SafeAreaProvider>
      <Main />
    </SafeAreaProvider>
  );
}

function Main() {
  const [data, setData] = useState<AppData | null>(null);
  const [loadFailed, setLoadFailed] = useState(false); // data stays null then, so every edit and persist is blocked
  const [month, setMonth] = useState(today().slice(0, 7));
  const [tab, setTab] = useState('all'); // 'all', 'summary', 'annual' or a card id
  const [menuOpen, setMenuOpen] = useState(false);
  const [actionsFor, setActionsFor] = useState<Transaction | null>(null); // row whose options are open
  const [query, setQuery] = useState('');
  const [entryForm, setEntryForm] = useState<{ tx: Transaction | null } | null>(null); // null = closed; tx null = new entry
  const [cardForm, setCardForm] = useState<{ card: Card | null; onCreated?: (id: string) => void } | null>(null); // null = closed; card null = new
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
    loadData().then(setData).catch(() => setLoadFailed(true));
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
    // an investment has no card, method, vencimento or repetition, whatever the form still holds
    const isInvestment = v.type === 'investment';
    const invest = isInvestment
      ? { bank: v.bank, currentValueCents: v.currentValue.trim() ? parseMoneyToCents(v.currentValue) : undefined, ratePct: v.rate }
      : {};
    // never point at a card that no longer exists (e.g. after restoring a backup)
    const cardId = !isInvestment && v.cardId && data.cards.some((c) => c.id === v.cardId) ? v.cardId : undefined;

    // a purchase cannot be created or moved into an invoice that is already paid
    const refusePaidInvoice = (next: Transaction[]) => {
      if (isInvestment) return false;
      const hit = movedIntoPaidInvoice(data.transactions, next, data.cards);
      if (!hit) return false;
      Alert.alert('Fatura já paga', `A fatura de ${monthLabel(hit.month)} do cartão ${hit.card.name} já está paga. Reabra a fatura para lançar nela.`);
      return true;
    };

    if (editing) {
      let next: Transaction[];
      try {
        next = applyEdit(data.transactions, editing, {
          type: v.type,
          amountCents: cents,
          description: v.desc.trim(),
          category: isInvestment ? INVESTMENT_CATEGORY : v.category,
          date: v.date,
          cardId,
          method: isInvestment ? undefined : (v.method ?? undefined),
          due: isInvestment ? undefined : v.due || undefined,
          ...invest,
        });
      } catch (e) {
        Alert.alert(isInvestment ? 'Investimento inválido' : 'Não foi possível salvar', e instanceof Error ? e.message : String(e));
        return false;
      }
      if (refusePaidInvoice(next)) return false;
      persist({ ...data, transactions: next });
      const saved = next.find((x) => x.id === editing.id);
      if (saved) setMonth(monthOf(saved, data.cards));
      return true;
    }

    // "once" is a single row; otherwise the series needs at least two months
    let times = 1;
    if (v.repeat !== 'once' && !isInvestment) {
      const max = v.repeat === 'recurring' ? MAX_RECURRING : MAX_INSTALLMENTS;
      times = Math.floor(Number(v.times) || 0);
      if (times < 2 || times > max) {
        Alert.alert(v.repeat === 'recurring' ? 'Meses inválidos' : 'Parcelas inválidas', `Informe de 2 a ${max}.`);
        return false;
      }
    }
    const mode = v.repeat === 'recurring' ? 'recurring' : 'installment';
    const paidCount = mode === 'installment' && !isInvestment ? Math.floor(Number(v.paidInstallments) || 0) : 0;
    if (paidCount < 0 || paidCount >= times) {
      Alert.alert('Parcelas pagas inválidas', `Informe de 0 a ${times - 1}: precisa sobrar pelo menos uma parcela a pagar.`);
      return false;
    }
    const groupId = newId();
    let created: Transaction[];
    try {
      created = buildEntries(
        {
          type: v.type,
          amountCents: cents,
          description: v.desc.trim(),
          category: isInvestment ? INVESTMENT_CATEGORY : v.category,
          date: v.date,
          cardId,
          method: isInvestment ? undefined : (v.method ?? undefined),
          due: isInvestment ? undefined : v.due || undefined,
          times,
          mode,
          paidCount,
          ...invest,
        },
        groupId,
        new Date().toISOString(),
      );
    } catch (e) {
      Alert.alert(isInvestment ? 'Investimento inválido' : 'Não foi possível salvar', e instanceof Error ? e.message : String(e));
      return false;
    }
    const next = [...created, ...data.transactions];
    if (refusePaidInvoice(next)) return false;
    persist({ ...data, transactions: next });
    setMonth(monthOf(created[0], data.cards)); // jump to the month where the first new row is listed
    return true;
  };

  /** Registers a new card or updates the one being edited. Returns true when saved. */
  const saveCard = (v: CardValues, editing: Card | null, onCreated?: (id: string) => void): boolean => {
    if (!data) return false;
    if (data.cards.some((c) => c.id !== editing?.id && c.name.toLowerCase() === v.name.toLowerCase())) {
      Alert.alert('Cartão repetido', `Já existe um cartão chamado "${v.name}".`);
      return false;
    }
    const { limitCents, closingDay, dueDay } = v;
    if (editing) {
      persist({ ...data, cards: data.cards.map((c) => (c.id === editing.id ? { ...c, name: v.name, limitCents, closingDay, dueDay } : c)) });
    } else {
      const card: Card = { id: newId(), name: v.name, limitCents, closingDay, dueDay };
      persist({ ...data, cards: [...data.cards, card] });
      onCreated?.(card.id);
    }
    return true;
  };

  /** Marks (or reopens) the invoice that closes in `month`. */
  const setInvoicePaid = (card: Card, month: string, paid: boolean) => {
    if (!data) return;
    const list = (card.paid ?? []).filter((m) => m !== month);
    persist({ ...data, cards: data.cards.map((c) => (c.id === card.id ? { ...c, paid: paid ? [...list, month] : list } : c)) });
  };

  /** Toggles an expense paid outside a card between pending and paid. */
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
        `Substitui os ${data.transactions.length} lançamentos atuais por ${imported.transactions.length} do arquivo. Uma cópia do estado atual é guardada em backups/antes-de-restaurar-… antes de substituir.`,
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Restaurar',
            // runs in the write queue (which never rejects, so an earlier failed save cannot block it): the copy
            // must land first, and when it fails the imported data is neither shown nor saved
            onPress: () => {
              queue.current = queue.current.then(async () => {
                try {
                  await saveRestorePoint(data);
                } catch (e) {
                  Alert.alert('Não foi possível guardar o estado atual', `A restauração foi cancelada. ${e instanceof Error ? e.message : String(e)}`);
                  return;
                }
                setData(imported);
                await saveData(imported).catch((e) => Alert.alert('Erro ao salvar', String(e?.message ?? e)));
              });
            },
          },
        ],
      );
    } catch (e) {
      Alert.alert('Arquivo inválido', e instanceof Error ? e.message : String(e));
    }
  };

  const rows = useMemo(
    () =>
      (data?.transactions ?? [])
        .filter((x) => monthOf(x, data?.cards ?? []) === month)
        .sort(byNewest),
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
        ? invoiceRows(data?.transactions ?? [], activeCard, month).sort(byNewest)
        : rows,
    [rows, activeCard, data, month],
  );
  const cardSpend = tabRows.reduce((sum, x) => sum + spendOf(x), 0);

  // the search narrows only the list; the summary cards keep showing the whole month
  const inSummary = tab === 'summary';
  const inAnnual = tab === 'annual'; // whole-year report: no month picker, search, list or new-entry button
  const sortedCards = useMemo(() => sortCardsByLimit(data?.cards ?? []), [data]);
  /** navigate and close the menu */
  const go = (id: string) => {
    setTab(id);
    setMenuOpen(false);
  };
  /** open the card form from the menu (null = a new card) */
  const openCardForm = (card: Card | null) => {
    setMenuOpen(false);
    setCardForm({ card });
  };
  const byCategory = useMemo(() => spendByCategory(rows), [rows]);
  const series = useMemo(() => monthlySeries(data?.transactions ?? [], data?.cards ?? [], month, 6), [data, month]);
  const cardNameOf = (id?: string) => data?.cards.find((c) => c.id === id)?.name ?? '';
  const methodNameOf = (m?: Method) => (m ? methodLabel(m) : '');
  const shownRows = useMemo(
    () => filterRows(tabRows, { query }, cardNameOf, methodNameOf),
    [tabRows, query, data],
  );
  const filtering = query.trim() !== '';
  const shownTotals = monthTotals(shownRows, data?.cards ?? []);
  const portfolio = useMemo(() => portfolioTotals(data?.transactions ?? []), [data]);
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
        <Text style={{ color: t.text, textAlign: 'center', padding: 24 }}>
          {loadFailed ? 'Não foi possível ler seus dados. Seus arquivos não foram alterados e nada será gravado enquanto este aviso aparecer. Você pode fechar e abrir o app para tentar de novo ou compartilhar o arquivo de dados para guardá-lo.' : 'Carregando…'}
        </Text>
        {loadFailed && (
          <Pressable onPress={() => shareRawData().catch((e) => Alert.alert('Erro', String(e?.message ?? e)))} accessibilityRole="button" style={{ padding: 12 }}>
            <Text style={{ color: t.text, textDecorationLine: 'underline' }}>Compartilhar arquivo de dados</Text>
          </Pressable>
        )}
      </SafeAreaView>
    );

  return (
    <ThemeContext.Provider value={t}>
      <SafeAreaView style={s.container} edges={['top', 'left', 'right', 'bottom']}>
        <StatusBar style={t.dark ? 'light' : 'dark'} />

        {/* Barra superior: título + seletor de mês */}
        <View style={s.topBar}>
          <View style={s.titleRow}>
            <Pressable onPress={() => setMenuOpen(true)} hitSlop={10} style={s.menuBtn} accessibilityRole="button" accessibilityLabel="Abrir menu">
              <Text style={s.menuIcon}>☰</Text>
            </Pressable>
            <Text style={s.title} numberOfLines={1}>
              {inSummary ? 'Relatórios' : inAnnual ? 'Relatório anual' : activeCard ? activeCard.name : 'Principal'}
            </Text>
          </View>
          {!inAnnual && (
          <View style={s.monthNav}>
            <Pressable hitSlop={8} onPress={() => setMonth(shiftMonth(month, -1))} style={s.navBtn} accessibilityRole="button" accessibilityLabel="Mês anterior">
              <Text style={s.navArrow}>‹</Text>
            </Pressable>
            <Text style={s.monthText}>{monthLabel(month)}</Text>
            <Pressable hitSlop={8} onPress={() => setMonth(shiftMonth(month, 1))} style={s.navBtn} accessibilityRole="button" accessibilityLabel="Próximo mês">
              <Text style={s.navArrow}>›</Text>
            </Pressable>
          </View>
          )}
        </View>

        {/* Aviso de vencidos (qualquer mês) */}
        {!onCard && !inSummary && !inAnnual && overdue.count > 0 && (
          <Pressable onPress={() => overdue.oldestMonth && setMonth(overdue.oldestMonth)} style={s.alert} accessibilityRole="button" accessibilityLabel="Ver o mais antigo vencido">
            <Text style={s.alertText} numberOfLines={1}>
              ⚠ {overdue.count} {overdue.count === 1 ? 'vencido' : 'vencidos'} · {brl(overdue.cents)}
            </Text>
            <Text style={s.alertGo}>Ver ›</Text>
          </Pressable>
        )}

        {/* Resumo em cartões */}
        {inAnnual ? null : onCard ? (
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
              <Pressable onPress={() => setCardForm({ card: activeCard })} style={s.limitBox} hitSlop={6} accessibilityRole="button">
                <Text style={s.limitNote}>Sem limite cadastrado. Toque para informar e ver o limite disponível.</Text>
              </Pressable>
            )}
          </View>
        ) : (
          <View key="all-summary">
            <View style={s.stats}>
              <Stat s={s} label="Receitas" value={brl(totals.income)} color={t.green} />
              <Stat s={s} label="Gastos" value={brl(totals.expense)} color={t.red} sub={totals.pending > 0 ? `${brl(totals.pending)} pendentes` : undefined} />
              <Stat s={s} label="Saldo" value={brl(totals.balance)} color={totals.balance >= 0 ? t.green : t.red} sub={totals.invested > 0 ? 'já desconta o investido' : undefined} />
            </View>
            {/* only for people who invest: what went in this month and what the whole portfolio is worth */}
            {(totals.invested > 0 || portfolio.applied > 0) && (
              <View style={[s.stats, { marginTop: 8 }]}>
                <Stat s={s} label="Investido no mês" value={brl(totals.invested)} color={t.primary} />
                <Stat s={s} label="Carteira" value={brl(portfolio.current)} color={t.primary} sub={`rendimento ${gainText(portfolio.gain, portfolio.gainPct)}`} />
              </View>
            )}
          </View>
        )}

        {inSummary ? (
          <Summary rows={rows} series={series} byCategory={byCategory} byPayment={byPayment} />
        ) : inAnnual ? (
          <AnnualReport list={data.transactions} cards={data.cards} cardName={cardNameOf} methodName={methodNameOf} />
        ) : (
          <>
          {activeCard && (
            <Pressable onPress={() => setCardForm({ card: activeCard })} style={s.editRow} hitSlop={8} accessibilityRole="button">
              <Text style={s.editLink}>✎ Editar cartão</Text>
            </Pressable>
          )}

          {/* Busca e filtro por categoria */}
          {tabRows.length > 0 && (
            <View style={s.searchWrap}>
              <View style={s.searchBox}>
                <Text style={s.searchIcon} importantForAccessibility="no" accessibilityElementsHidden>🔎</Text>
                <TextInput
                  style={s.searchInput}
                  accessibilityLabel="Buscar lançamentos"
                  placeholder="Buscar por descrição, categoria, cartão…"
                  placeholderTextColor={t.textFaint}
                  value={query}
                  onChangeText={setQuery}
                  returnKeyType="search"
                  autoCorrect={false}
                />
                {query !== '' && (
                  <Pressable onPress={() => setQuery('')} hitSlop={10} accessibilityRole="button" accessibilityLabel="Limpar busca">
                    <Text style={s.searchClear}>✕</Text>
                  </Pressable>
                )}
              </View>
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
                    {filtering ? '' : `\nToque em “${onCard ? 'Novo gasto' : 'Novo'}” para adicionar.`}
                  </Text>
                }
                renderItem={({ item }) => {
                  const card = item.cardId ? data.cards.find((c) => c.id === item.cardId) : undefined;
                  const kind = payKind(item);
                  const pending = isPending(item, data.cards);
                  const overdue = isOverdue(item, data.cards, today());
                  const due = dueOf(item, data.cards);
                  // income carries no status; every expense is paid, pending or overdue
                  const status = kind === 'none' ? null : overdue ? 'overdue' : pending ? 'pending' : 'paid';
                  const isInv = item.type === 'investment';
                  const parts = [
                    item.description && item.type === 'expense' ? { k: 'cat', text: item.category, color: t.textMuted } : null,
                    isInv ? { k: 'bank', text: `🏦 ${item.bank ?? ''}`, color: t.link } : null,
                    isInv && item.currentValueCents !== undefined ? { k: 'gain', text: gainLabel(item), color: gainOf(item) < 0 ? t.red : gainOf(item) > 0 ? t.green : t.textMuted } : null,
                    card ? { k: 'card', text: `💳 ${card.name}`, color: t.link } : null,
                    !card && item.method ? { k: 'method', text: methodLabel(item.method), color: t.textMuted } : null,
                    item.installment ? { k: 'inst', text: `Parcela ${item.installment.n}/${item.installment.of}`, color: t.amber } : null,
                    item.recurring ? { k: 'rec', text: `Recorrente ${item.recurring.n}/${item.recurring.of}`, color: t.amber } : null,
                    status === 'overdue' ? { k: 'status', text: 'Vencido', color: t.red } : status === 'pending' ? { k: 'status', text: 'Pendente', color: t.amber } : status === 'paid' ? { k: 'status', text: 'Pago', color: t.green } : null,
                    pending && due ? { k: 'due', text: `vence ${shortDate(due)}`, color: overdue ? t.red : t.textMuted } : null,
                  ].filter((x): x is { k: string; text: string; color: string } => x !== null);
                  return (
                    <Pressable
                      onPress={() => setActionsFor(item)}
                      style={({ pressed }) => [s.row, status === 'paid' && s.rowPaid, status === 'pending' && s.rowPending, status === 'overdue' && s.rowOverdue, pressed && { opacity: 0.7 }]}
                      accessibilityRole="button"
                      accessibilityLabel={`${titleOf(item)}, ver opções`}
                    >
                      {status === 'overdue' && <View style={s.rowBar} />}
                      <Text style={s.rowDate}>{shortDate(item.date)}</Text>
                      <View style={s.flex1}>
                        <Text style={s.rowTitle} numberOfLines={1}>
                          {titleOf(item)}
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
                      <Text style={[s.rowValue, { color: isInv ? t.primary : item.type === 'expense' ? t.red : t.green }]} numberOfLines={1}>
                        {isInv ? '→' : item.type === 'expense' ? '−' : '+'} {brl(item.amountCents)}
                      </Text>
                    </Pressable>
                  );
                }}
              />
              {/* Total, fixo no rodapé do cartão */}
              <View style={s.listFoot}>
                <Text style={s.footLabel}>
                  {filtering ? 'Filtrado' : 'Total'} · {shownRows.length} {shownRows.length === 1 ? 'linha' : 'linhas'}
                  {!onCard && shownTotals.invested > 0 ? ' · já desconta o investido' : ''}
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
        {!inSummary && !inAnnual && <Text style={s.hint}>{onCard ? 'Toque numa linha para editar ou excluir' : 'Toque numa linha para marcar como pago, editar ou excluir'}</Text>}

        <Drawer visible={menuOpen} onClose={() => setMenuOpen(false)}>
          <Text style={s.drawerTitle}>Controle de Gastos</Text>

          <DrawerSection title="Navegar" />
          <DrawerItem icon="🏠" label="Principal" active={!inSummary && !inAnnual && !onCard} onPress={() => go('all')} />
          <DrawerItem icon="📊" label="Relatórios" active={inSummary} onPress={() => go('summary')} />
          <DrawerItem icon="📅" label="Relatório anual" active={inAnnual} onPress={() => go('annual')} />

          <DrawerSection title="Cartões" />
          {sortedCards.map((c) => (
            <DrawerItem
              key={c.id}
              icon="💳"
              label={c.name}
              sub={c.limitCents ? `Limite ${brl(c.limitCents)}` : 'Sem limite · toque para informar'}
              active={activeCard?.id === c.id}
              onPress={() => (c.limitCents ? go(c.id) : openCardForm(c))}
            />
          ))}
          {sortedCards.length === 0 && <Text style={s.drawerEmpty}>Nenhum cartão cadastrado ainda.</Text>}
          <DrawerItem icon={<PlusIcon color={t.text} />} label="Novo cartão" onPress={() => openCardForm(null)} />

          <DrawerDivider />
          <DrawerSection title="Opções" />
          <DrawerItem icon={t.dark ? '☀️' : '🌙'} label={t.dark ? 'Tema claro' : 'Tema escuro'} onPress={toggleTheme} />
          <DrawerItem icon={<TrayArrow dir="up" color={t.text} />} label="Exportar backup" onPress={() => { setMenuOpen(false); exportBackup(data).catch((e) => Alert.alert('Erro', String(e?.message ?? e))); }} />
          <DrawerItem icon={<TrayArrow dir="down" color={t.text} />} label="Restaurar backup" onPress={() => { setMenuOpen(false); restore(); }} />
        </Drawer>

        <RowActions
          tx={actionsFor}
          cards={data.cards}
          onClose={() => setActionsFor(null)}
          onTogglePaid={(tx) => {
            togglePaid(tx);
            setActionsFor(null);
          }}
          onUpdateValue={(tx, cents) => {
            if (!data) return;
            setActionsFor(null);
            persist({ ...data, transactions: updateCurrentValue(data.transactions, tx.id, cents) });
          }}
          onEdit={(tx) => {
            setActionsFor(null);
            setEntryForm({ tx });
          }}
          onDelete={(tx) => {
            setActionsFor(null);
            remove(tx);
          }}
        />

        <CardModal
          visible={cardForm !== null}
          card={cardForm?.card ?? null}
          onClose={() => setCardForm(null)}
          onSave={(v) => saveCard(v, cardForm?.card ?? null, (id) => (cardForm?.onCreated ? cardForm.onCreated(id) : setTab(id)))}
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
          onNewCard={(onCreated) => setCardForm({ card: null, onCreated })}
          onRemoveCard={removeCard}
        />
      </SafeAreaView>
    </ThemeContext.Provider>
  );
}

function Stat({ s, label, value, color, sub }: { s: ReturnType<typeof makeStyles>; label: string; value: string; color: string; sub?: string }) {
  return (
    <View style={s.stat}>
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

    topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 10, paddingBottom: 6 },
    title: { fontSize: 19, fontWeight: '800', color: t.text, letterSpacing: -0.3 },
    monthNav: { flexDirection: 'row', alignItems: 'center', backgroundColor: t.surface, borderRadius: 20, borderWidth: 1, borderColor: t.border },
    navBtn: { paddingHorizontal: 12, paddingVertical: 4 },
    navArrow: { fontSize: 20, fontWeight: '700', color: t.primary },
    monthText: { fontSize: 12, fontWeight: '700', color: t.text, minWidth: 100, textAlign: 'center' },

    titleRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingRight: 8 },
    menuBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, alignItems: 'center', justifyContent: 'center' },
    menuIcon: { fontSize: 20, color: t.text, marginTop: -1 },
    drawerTitle: { fontSize: 20, fontWeight: '800', color: t.text, letterSpacing: -0.3, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4 },
    drawerEmpty: { fontSize: 12, color: t.textFaint, paddingHorizontal: 12, paddingVertical: 6 },

    alert: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 16, marginTop: 8, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: t.red, backgroundColor: t.redSoft },
    alertText: { flex: 1, fontSize: 13, fontWeight: '800', color: t.red },
    alertGo: { fontSize: 13, fontWeight: '800', color: t.red },
    stats: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginTop: 6 },
    stat: { flex: 1, backgroundColor: t.surface, borderRadius: 16, borderWidth: 1, borderColor: t.border, paddingHorizontal: 12, paddingVertical: 11 },
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
    listWrap: { flex: 1, marginHorizontal: 16, marginTop: 12 },
    listCard: { flex: 1, backgroundColor: t.surface, borderRadius: 18, borderWidth: 1, borderColor: t.border, overflow: 'hidden' },
    listHead: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, backgroundColor: t.surfaceAlt },
    th: { fontSize: 10, fontWeight: '800', color: t.textMuted, letterSpacing: 0.6 },
    row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth * 2, borderBottomColor: t.border },
    rowPaid: { backgroundColor: t.greenSoft },
    rowPending: { backgroundColor: t.pendingSoft },
    rowOverdue: { backgroundColor: t.redSoft },
    rowBar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, backgroundColor: t.red },
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

  });
