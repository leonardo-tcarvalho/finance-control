import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { annualTotals, availableYears, gainText, monthlySeries, portfolioByBank, portfolioTotals, spendByCategory, spendByOrigin, spendByPayment, splitPercents, topExpenses, yearRows } from './calc';
import { Bars, Card, Evolution, Kpi, makeStyles } from './Summary';
import { useTheme } from './theme';
import { Card as CardData, Method, Transaction } from './types';
import { brl, formatDateBR, monthLabel, today } from './utils';

interface Props {
  /** every transaction: the year is chosen here */
  list: Transaction[];
  cards: CardData[];
  cardName: (id?: string) => string;
  methodName: (m?: Method) => string;
}

/** Whole-year report. Read only: nothing here writes to the data. */
export default function AnnualReport({ list, cards, cardName, methodName }: Props) {
  const t = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);
  const years = useMemo(() => availableYears(list, cards), [list, cards]);
  const [picked, setPicked] = useState<string | null>(null);
  const thisYear = today().slice(0, 4);
  const year = picked && years.includes(picked) ? picked : years.includes(thisYear) ? thisYear : years[0];

  // the totals and the 12 months must come from the same rows, so both are built from `rows`
  const rows = useMemo(() => (year ? yearRows(list, cards, year) : []), [list, cards, year]);
  const series = useMemo(() => monthlySeries(rows, cards, `${year}-12`, 12), [rows, cards, year]);
  const totals = useMemo(() => annualTotals(rows, series), [rows, series]);
  const byCategory = useMemo(() => spendByCategory(rows), [rows]);
  const byPayment = useMemo(() => spendByPayment(rows, cardName, methodName), [rows, cardName, methodName]);
  const top = useMemo(() => topExpenses(rows, 5), [rows]);
  const origin = useMemo(() => spendByOrigin(rows), [rows]);
  const portfolio = useMemo(() => portfolioTotals(list), [list]);
  const holdings = useMemo(() => portfolioByBank(list), [list]);

  if (!year) {
    return (
      <View style={s.body}>
        <Text style={s.empty}>Nenhum lançamento ainda.</Text>
      </View>
    );
  }

  const i = years.indexOf(year); // years are newest first
  const none = <Text style={s.empty}>Nenhum gasto neste ano.</Text>;
  const originPct = splitPercents([origin.installment, origin.recurring, origin.single]);
  const originRows = [
    { label: 'Parcelado', cents: origin.installment, pct: originPct[0] },
    { label: 'Recorrente', cents: origin.recurring, pct: originPct[1] },
    { label: 'Avulso', cents: origin.single, pct: originPct[2] },
  ];

  return (
    <ScrollView style={s.flex1} contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
        <Pressable hitSlop={8} disabled={i >= years.length - 1} onPress={() => setPicked(years[i + 1])} accessibilityRole="button" accessibilityLabel="Ano anterior" style={{ paddingHorizontal: 12, paddingVertical: 4, opacity: i >= years.length - 1 ? 0.3 : 1 }}>
          <Text style={{ color: t.text, fontSize: 22 }}>‹</Text>
        </Pressable>
        <Text style={{ color: t.text, fontSize: 18, fontWeight: '800' }}>{year}</Text>
        <Pressable hitSlop={8} disabled={i <= 0} onPress={() => setPicked(years[i - 1])} accessibilityRole="button" accessibilityLabel="Próximo ano" style={{ paddingHorizontal: 12, paddingVertical: 4, opacity: i <= 0 ? 0.3 : 1 }}>
          <Text style={{ color: t.text, fontSize: 22 }}>›</Text>
        </Pressable>
      </View>

      <Card title="Totais do ano" s={s}>
        <View style={s.kpis}>
          <Kpi s={s} label="Receitas" value={brl(totals.income)} color={t.green} />
          <Kpi s={s} label="Gastos" value={brl(totals.expense)} color={t.red} />
        </View>
        <View style={s.kpis}>
          <Kpi s={s} label="Saldo" value={brl(totals.balance)} color={totals.balance >= 0 ? t.green : t.red} />
          <Kpi s={s} label="Média mensal de gastos" value={brl(totals.monthlyAverage)} color={t.text} />
        </View>
        {(totals.invested > 0 || portfolio.applied > 0) && (
          <View style={s.kpis}>
            <Kpi s={s} label="Investido no ano" value={brl(totals.invested)} color={t.primary} />
            <Kpi s={s} label="Rendimento da carteira" value={gainText(portfolio.gain, portfolio.gainPct)} color={portfolio.gain < 0 ? t.red : portfolio.gain > 0 ? t.green : t.text} />
          </View>
        )}
        <Text style={s.note}>A média considera só os meses com gasto.{totals.invested > 0 ? ' O saldo já desconta o que foi investido no ano. O rendimento é o da carteira inteira, de todos os anos.' : ''}</Text>
      </Card>

      <Card title="Meses de maior e menor gasto" s={s}>
        {totals.topMonth && totals.lowMonth ? (
          <>
            <Text style={s.note}>
              Mais gastou: {monthLabel(totals.topMonth.month)} · {brl(totals.topMonth.expense)}
            </Text>
            <Text style={s.note}>
              Menos gastou: {monthLabel(totals.lowMonth.month)} · {brl(totals.lowMonth.expense)}
            </Text>
          </>
        ) : (
          none
        )}
      </Card>

      <Card title="Gastos mês a mês" s={s}>
        <Evolution s={s} series={series} highlightLast={false} />
      </Card>

      <Card title="Gastos por categoria" s={s}>
        {byCategory.length === 0 ? none : <Bars s={s} slices={byCategory} color={t.primary} />}
      </Card>

      <Card title="Como você pagou" s={s}>
        {byPayment.length === 0 ? none : <Bars s={s} slices={byPayment} color={t.link} />}
      </Card>

      <Card title="Maiores gastos do ano" s={s}>
        {top.length === 0
          ? none
          : top.map((x) => (
              <View key={x.id} style={s.barHead}>
                <Text style={s.barLabel} numberOfLines={1}>
                  {x.description || x.category} · {formatDateBR(x.date)}
                </Text>
                <Text style={s.barValue}>{brl(x.amountCents)}</Text>
              </View>
            ))}
      </Card>

      {holdings.length > 0 && (
        <Card title="Onde está investido" s={s}>
          {holdings.map((h) => (
            <View key={h.bank} style={s.barHead}>
              <Text style={s.barLabel} numberOfLines={1}>
                {h.bank}
              </Text>
              <Text style={s.barValue}>
                {brl(h.current)} · {gainText(h.gain, h.gainPct)}
              </Text>
            </View>
          ))}
          <Text style={s.empty}>A carteira é a de todos os meses, não só deste ano. O valor é o atual informado por você (ou o aplicado, se não informou).</Text>
        </Card>
      )}

      <Card title="Parcelado, recorrente e avulso" s={s}>
        {totals.expense === 0 ? (
          none
        ) : (
          originRows.map((x) => (
            <View key={x.label} style={s.barHead}>
              <Text style={s.barLabel}>{x.label}</Text>
              <Text style={s.barValue}>
                {brl(x.cents)} · {x.pct}%
              </Text>
            </View>
          ))
        )}
      </Card>
    </ScrollView>
  );
}
