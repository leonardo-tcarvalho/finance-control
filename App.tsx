import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { exportBackup, pickBackup } from './src/backup';
import { loadData, saveData } from './src/storage';
import { AppData, CATEGORIES, Transaction, TxType, emptyData } from './src/types';

const GREEN = '#15803d';
const RED = '#b91c1c';
const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

const brl = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const today = () => new Date().toISOString().slice(0, 10);
const shortDate = (iso: string) => iso.slice(8, 10) + '/' + iso.slice(5, 7);
const monthLabel = (key: string) => `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;
const shiftMonth = (key: string, delta: number) => {
  const d = new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

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
  const [type, setType] = useState<TxType>('expense');
  const [amount, setAmount] = useState('');
  const [desc, setDesc] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
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

  const add = () => {
    const cents = Math.round(parseFloat(amount.replace(',', '.')) * 100);
    if (!data || !Number.isFinite(cents) || cents <= 0) return Alert.alert('Valor inválido');
    const tx: Transaction = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      amountCents: cents,
      category,
      description: desc.trim(),
      date: today(),
      createdAt: new Date().toISOString(),
    };
    persist({ ...data, transactions: [tx, ...data.transactions] });
    setAmount('');
    setDesc('');
    setMonth(today().slice(0, 7)); // jump to the month where the new row lives
  };

  const remove = (id: string) =>
    data &&
    Alert.alert('Excluir lançamento?', undefined, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: () => persist({ ...data, transactions: data.transactions.filter((t) => t.id !== id) }),
      },
    ]);

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

  if (!data)
    return (
      <SafeAreaView style={s.center}>
        <Text>Carregando…</Text>
      </SafeAreaView>
    );

  return (
    <SafeAreaView style={s.container} edges={['top', 'left', 'right', 'bottom']}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
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

        {/* Resumo: 3 células lado a lado, rótulo em cima e valor embaixo */}
        <View style={s.grid}>
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

        {/* Linha de entrada: novo lançamento */}
        <View style={[s.grid, { marginTop: 10 }]}>
          <Text style={s.sectionHead}>NOVO LANÇAMENTO</Text>
          <View style={s.gridRow}>
            {(['expense', 'income'] as TxType[]).map((t, i) => (
              <Pressable
                key={t}
                onPress={() => setType(t)}
                style={[s.typeCell, s.flex1, i === 0 && s.bRight, type === t && { backgroundColor: t === 'expense' ? RED : GREEN }]}
              >
                <Text style={[s.typeText, type === t && { color: '#fff' }]}>{t === 'expense' ? 'Gasto (−)' : 'Receita (+)'}</Text>
              </Pressable>
            ))}
          </View>
          <View style={s.gridRow}>
            <View style={[s.inputBox, { width: 110 }, s.bRight]}>
              <Text style={s.inputLabel}>VALOR (R$)</Text>
              <TextInput style={s.input} placeholder="0,00" placeholderTextColor="#94a3b8" keyboardType="decimal-pad" value={amount} onChangeText={setAmount} />
            </View>
            <View style={[s.inputBox, s.flex1]}>
              <Text style={s.inputLabel}>DESCRIÇÃO</Text>
              <TextInput style={s.input} placeholder="Ex.: mercado" placeholderTextColor="#94a3b8" value={desc} onChangeText={setDesc} />
            </View>
          </View>
          <View style={[s.inputBox, { paddingBottom: 6 }]}>
            <Text style={s.inputLabel}>CATEGORIA</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: 4 }}>
              {CATEGORIES.map((c) => (
                <Pressable key={c} onPress={() => setCategory(c)} style={[s.chip, category === c && s.chipOn]}>
                  <Text style={[s.chipText, category === c && s.chipTextOn]}>{c}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
          <Pressable style={s.add} onPress={add}>
            <Text style={s.addText}>+ Adicionar linha</Text>
          </Pressable>
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
            data={rows}
            keyExtractor={(t) => t.id}
            style={{ flex: 1 }}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={<Text style={s.empty}>Nenhum lançamento em {monthLabel(month)}.</Text>}
            renderItem={({ item, index }) => (
              <Pressable onLongPress={() => remove(item.id)} style={[s.gridRow, s.dataRow, index % 2 === 1 && s.zebra]}>
                <Text style={[s.cell, s.cDate, s.bRight, s.muted]} numberOfLines={1}>
                  {shortDate(item.date)}
                </Text>
                <Text style={[s.cell, s.flex1, s.bRight]} numberOfLines={1}>
                  {item.description || '—'}
                </Text>
                <Text style={[s.cell, s.cCat, s.bRight, s.muted]} numberOfLines={1}>
                  {item.category}
                </Text>
                <Text style={[s.cell, s.cVal, s.right, s.bold, { color: item.type === 'income' ? GREEN : RED }]} numberOfLines={1}>
                  {item.type === 'income' ? '+' : '−'} {brl(item.amountCents)}
                </Text>
              </Pressable>
            )}
          />
          {/* Linha de total, fixa no rodapé da tabela */}
          <View style={[s.gridRow, s.totalRow]}>
            <Text style={[s.cell, s.flex1, s.bold]}>
              TOTAL · {rows.length} {rows.length === 1 ? 'linha' : 'linhas'}
            </Text>
            <Text style={[s.cell, s.right, s.bold, { color: totals.balance >= 0 ? GREEN : RED }]}>{brl(totals.balance)}</Text>
          </View>
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
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const LINE = '#cbd5e1';

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#eef2f7' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  flex1: { flex: 1 },
  right: { textAlign: 'right' },
  bold: { fontWeight: '700' },
  muted: { color: '#64748b' },
  bRight: { borderRightWidth: StyleSheet.hairlineWidth * 2, borderRightColor: LINE },

  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10 },
  title: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  monthNav: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 6, borderWidth: 1, borderColor: LINE },
  navBtn: { paddingHorizontal: 10, paddingVertical: 2 },
  navArrow: { fontSize: 20, fontWeight: '700', color: '#0f172a' },
  monthText: { fontSize: 12, fontWeight: '700', color: '#0f172a', minWidth: 104, textAlign: 'center' },

  grid: { marginHorizontal: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: LINE },
  gridRow: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth * 2, borderBottomColor: LINE },
  hCell: { backgroundColor: '#e2e8f0', paddingHorizontal: 8, paddingVertical: 5, fontSize: 10, fontWeight: '800', color: '#475569', letterSpacing: 0.4 },
  vCell: { paddingHorizontal: 8, paddingVertical: 8, fontSize: 15, fontWeight: '800' },
  sectionHead: { backgroundColor: '#e2e8f0', paddingHorizontal: 8, paddingVertical: 5, fontSize: 10, fontWeight: '800', color: '#475569', letterSpacing: 0.4, borderBottomWidth: StyleSheet.hairlineWidth * 2, borderBottomColor: LINE },

  typeCell: { alignItems: 'center', paddingVertical: 8, backgroundColor: '#f8fafc' },
  typeText: { fontSize: 13, fontWeight: '700', color: '#334155' },
  inputBox: { paddingHorizontal: 8, paddingTop: 4, borderBottomWidth: StyleSheet.hairlineWidth * 2, borderBottomColor: LINE },
  inputLabel: { fontSize: 9, fontWeight: '800', color: '#94a3b8', letterSpacing: 0.4 },
  input: { fontSize: 15, paddingVertical: 4, paddingHorizontal: 0, color: '#0f172a' },
  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 4, backgroundColor: '#e2e8f0', marginRight: 6 },
  chipOn: { backgroundColor: '#0f172a' },
  chipText: { fontSize: 12, color: '#334155' },
  chipTextOn: { color: '#fff', fontWeight: '700' },
  add: { backgroundColor: '#0f172a', paddingVertical: 11, alignItems: 'center' },
  addText: { color: '#fff', fontWeight: '700' },

  table: { flex: 1, marginTop: 10 },
  headRow: { borderBottomWidth: 1 },
  dataRow: { alignItems: 'stretch' },
  zebra: { backgroundColor: '#f8fafc' },
  cell: { paddingHorizontal: 8, paddingVertical: 9, fontSize: 13, color: '#0f172a' },
  cDate: { width: 64 },
  cCat: { width: 92 },
  cVal: { width: 104 },
  empty: { textAlign: 'center', color: '#94a3b8', marginTop: 24, paddingHorizontal: 12 },
  totalRow: { backgroundColor: '#e2e8f0', borderTopWidth: 1, borderTopColor: '#94a3b8', borderBottomWidth: 0 },
  hint: { textAlign: 'center', fontSize: 11, color: '#94a3b8', paddingVertical: 4 },

  footer: { flexDirection: 'row', backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: LINE },
  footBtn: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  link: { color: '#2563eb', fontWeight: '700', fontSize: 13 },
});
