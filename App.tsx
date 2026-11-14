import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from 'react-native';
import { exportBackup, pickBackup } from './src/backup';
import { loadData, saveData } from './src/storage';
import { AppData, CATEGORIES, Transaction, TxType, emptyData } from './src/types';

const brl = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const today = () => new Date().toISOString().slice(0, 10);

export default function App() {
  const [data, setData] = useState<AppData | null>(null);
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

  const totals = useMemo(() => {
    const month = today().slice(0, 7);
    let income = 0;
    let expense = 0;
    data?.transactions
      .filter((t) => t.date.startsWith(month))
      .forEach((t) => (t.type === 'income' ? (income += t.amountCents) : (expense += t.amountCents)));
    return { income, expense, balance: income - expense };
  }, [data]);

  if (!data)
    return (
      <SafeAreaView style={s.center}>
        <Text>Carregando…</Text>
      </SafeAreaView>
    );

  return (
    <SafeAreaView style={s.container}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Text style={s.title}>Controle de Gastos</Text>
        <View style={s.summary}>
          <Stat label="Entradas (mês)" value={brl(totals.income)} color="#15803d" />
          <Stat label="Saídas (mês)" value={brl(totals.expense)} color="#b91c1c" />
          <Stat label="Saldo" value={brl(totals.balance)} color={totals.balance >= 0 ? '#15803d' : '#b91c1c'} />
        </View>

        <View style={s.form}>
          <View style={s.row}>
            {(['expense', 'income'] as TxType[]).map((t) => (
              <Pressable key={t} onPress={() => setType(t)} style={[s.chip, type === t && s.chipOn]}>
                <Text style={type === t && s.chipTextOn}>{t === 'expense' ? 'Gasto' : 'Receita'}</Text>
              </Pressable>
            ))}
          </View>
          <TextInput style={s.input} placeholder="Valor (ex: 25,90)" keyboardType="decimal-pad" value={amount} onChangeText={setAmount} />
          <TextInput style={s.input} placeholder="Descrição" value={desc} onChangeText={setDesc} />
          <FlatList
            horizontal
            data={CATEGORIES}
            keyExtractor={(c) => c}
            showsHorizontalScrollIndicator={false}
            renderItem={({ item }) => (
              <Pressable onPress={() => setCategory(item)} style={[s.chip, category === item && s.chipOn]}>
                <Text style={category === item && s.chipTextOn}>{item}</Text>
              </Pressable>
            )}
          />
          <Pressable style={s.add} onPress={add}>
            <Text style={s.addText}>Adicionar</Text>
          </Pressable>
        </View>

        <FlatList
          data={data.transactions}
          keyExtractor={(t) => t.id}
          style={{ flex: 1 }}
          ListEmptyComponent={<Text style={s.empty}>Nenhum lançamento ainda.</Text>}
          renderItem={({ item }) => (
            <Pressable onLongPress={() => remove(item.id)} style={s.tx}>
              <View style={{ flex: 1 }}>
                <Text style={s.txDesc}>{item.description || item.category}</Text>
                <Text style={s.txMeta}>
                  {item.category} · {item.date.split('-').reverse().join('/')}
                </Text>
              </View>
              <Text style={{ color: item.type === 'income' ? '#15803d' : '#b91c1c', fontWeight: '600' }}>
                {item.type === 'income' ? '+' : '-'} {brl(item.amountCents)}
              </Text>
            </Pressable>
          )}
        />

        <View style={s.footer}>
          <Pressable onPress={() => exportBackup(data).catch((e) => Alert.alert('Erro', String(e?.message ?? e)))}>
            <Text style={s.link}>Exportar backup</Text>
          </Pressable>
          <Pressable onPress={restore}>
            <Text style={s.link}>Restaurar backup</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const Stat = ({ label, value, color }: { label: string; value: string; color: string }) => (
  <View style={s.stat}>
    <Text style={s.statLabel}>{label}</Text>
    <Text style={[s.statValue, { color }]}>{value}</Text>
  </View>
);

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', paddingTop: Platform.OS === 'android' ? 32 : 0 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: '700', padding: 16 },
  summary: { flexDirection: 'row', paddingHorizontal: 12, gap: 8 },
  stat: { flex: 1, backgroundColor: '#fff', borderRadius: 10, padding: 10 },
  statLabel: { fontSize: 11, color: '#64748b' },
  statValue: { fontSize: 14, fontWeight: '700', marginTop: 2 },
  form: { padding: 16, gap: 8 },
  row: { flexDirection: 'row', gap: 8 },
  input: { backgroundColor: '#fff', borderRadius: 8, padding: 10, borderWidth: 1, borderColor: '#e2e8f0' },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: '#e2e8f0', marginRight: 8 },
  chipOn: { backgroundColor: '#0f172a' },
  chipTextOn: { color: '#fff' },
  add: { backgroundColor: '#0f172a', borderRadius: 8, padding: 12, alignItems: 'center' },
  addText: { color: '#fff', fontWeight: '600' },
  empty: { textAlign: 'center', color: '#94a3b8', marginTop: 24 },
  tx: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', marginHorizontal: 12, marginBottom: 6, padding: 12, borderRadius: 10 },
  txDesc: { fontWeight: '600' },
  txMeta: { fontSize: 12, color: '#64748b' },
  footer: { flexDirection: 'row', justifyContent: 'space-around', padding: 12, borderTopWidth: 1, borderColor: '#e2e8f0' },
  link: { color: '#2563eb', fontWeight: '600' },
});
