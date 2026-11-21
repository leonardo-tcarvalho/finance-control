import { ReactNode, useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { MonthPoint, Slice, goalMessage, goalProgress, installmentCommitment, installmentText, investedShare, reserveLevel, savingsRate, totalsOf } from './domain/calc';
import { Theme, useTheme } from './theme';
import { Transaction } from './domain/types';
import { MONTHS, brl, signedPct } from './utils';

interface Props {
  /** rows of the selected month */
  rows: Transaction[];
  /** the same months' neighbours, for the comparison and the evolution chart */
  series: MonthPoint[];
  byCategory: Slice[];
  byPayment: Slice[];
  /** months of spending the investments cover, or null when it cannot be computed */
  reserveMonths: number | null;
  /** monthly spending goal in cents; absent = no goal, no card */
  goalCents?: number;
  /** max share of the month's income committed to installments, whole percent; absent = no limit */
  installmentPct?: number;
}

export const monthShort = (key: string) => MONTHS[Number(key.slice(5, 7)) - 1].slice(0, 3);

export default function Summary({ rows, series, byCategory, byPayment, reserveMonths, goalCents, installmentPct }: Props) {
  const t = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);
  const totals = totalsOf(rows);
  const current = series[series.length - 1];
  const previous = series.length > 1 ? series[series.length - 2] : undefined;
  const delta = previous && previous.expense > 0 ? Math.round(((current.expense - previous.expense) / previous.expense) * 100) : null;
  const share = investedShare(totals.invested, totals.income);
  const reserve = reserveMonths !== null && reserveMonths > 0 ? { months: reserveMonths, ...reserveLevel(reserveMonths) } : null;
  const showShare = share !== null && totals.invested > 0;
  const saved = savingsRate(current.income, current.expense);
  const commitment = installmentCommitment(rows, installmentPct);
  const inst = commitment && commitment.installments > 0 ? commitment : null; // needs income and installments in the month
  const goal = goalProgress(totals.expense, goalCents); // every expense of the month, paid or pending

  return (
    <ScrollView style={s.flex1} contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
      <Card title="Neste mês" s={s}>
        <View style={s.kpis}>
          <Kpi s={s} label="Gastos" value={brl(totals.expense)} color={t.red} />
          <Kpi s={s} label="Receitas" value={brl(totals.income)} color={t.green} />
        </View>
        {delta !== null && (
          <Text style={s.note}>
            {delta === 0 ? 'Mesmo gasto do mês anterior.' : `${Math.abs(delta)}% ${delta > 0 ? 'a mais' : 'a menos'} em gastos que o mês anterior (${brl(previous!.expense)}).`}
          </Text>
        )}
        {saved !== null && (
          <Text style={s.note}>{saved >= 0 ? `Sobrou ${saved}% da renda do mês.` : `Os gastos passaram ${Math.abs(saved)}% da renda do mês.`}</Text>
        )}
      </Card>

      {goal && goalCents && (
        <Card title="Meta de gastos" s={s}>
          <View style={s.barHead}>
            <Text style={s.barLabel}>
              {brl(totals.expense)} de {brl(goalCents)}
            </Text>
            <Text style={s.barValue}>{goal.pct}%</Text>
          </View>
          <View style={s.track}>
            <View style={[s.fill, { width: `${Math.min(100, goal.pct)}%`, backgroundColor: goal.level === 'passou' ? t.red : goal.level === 'perto' ? t.amber : t.primary }]} />
          </View>
          <Text style={s.note}>{goalMessage(totals.expense, goalCents, goal)}</Text>
        </Card>
      )}

      {(saved !== null || showShare || reserve || inst) && (
        <Card title="Saúde financeira" s={s}>
          {saved !== null && <Text style={s.note}>Taxa de poupança do mês: {signedPct(saved)} da renda.</Text>}
          {showShare && <Text style={s.note}>Parte da renda aplicada no mês: {share}%.</Text>}
          {inst && <Text style={[s.note, inst.over && { color: t.red }]}>{installmentText(inst, installmentPct)}</Text>}
          {reserve && (
            <Text style={s.note}>
              Reserva de emergência: {String(reserve.months).replace('.', ',')} {reserve.months === 1 ? 'mês' : 'meses'} de gastos ({reserve.level}). {reserve.text}
            </Text>
          )}
          <Text style={s.empty}>
            Indicadores para você se acompanhar; não são conselho financeiro.{reserve ? ' A reserva usa o valor atual de todos os investimentos e a média de gastos dos últimos 6 meses.' : ''}
          </Text>
        </Card>
      )}

      {totals.invested > 0 && (
        <Card title="Investido neste mês" s={s}>
          <Kpi s={s} label="Aplicado" value={brl(totals.invested)} color={t.primary} />
          {share !== null && <Text style={s.note}>{share}% da renda do mês foi aplicada.</Text>}
        </Card>
      )}

      <Card title="Gastos por categoria" s={s}>
        {byCategory.length === 0 ? <Text style={s.empty}>Nenhum gasto neste mês.</Text> : <Bars s={s} slices={byCategory} color={t.primary} />}
      </Card>

      <Card title="Como você pagou" s={s}>
        {byPayment.length === 0 ? <Text style={s.empty}>Nenhum gasto neste mês.</Text> : <Bars s={s} slices={byPayment} color={t.link} />}
      </Card>

      <Card title="Gastos nos últimos meses" s={s}>
        <Evolution s={s} series={series} />
      </Card>
    </ScrollView>
  );
}

export type Styles = ReturnType<typeof makeStyles>;

export function Card({ title, s, children }: { title: string; s: Styles; children: ReactNode }) {
  return (
    <View style={s.card}>
      <Text style={s.cardTitle}>{title}</Text>
      {children}
    </View>
  );
}

export function Kpi({ s, label, value, color }: { s: Styles; label: string; value: string; color: string }) {
  return (
    <View style={s.kpi}>
      <Text style={s.kpiLabel}>{label}</Text>
      <Text style={[s.kpiValue, { color }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
        {value}
      </Text>
    </View>
  );
}

/** Horizontal bars with the value and the share of the total. */
export function Bars({ s, slices, color }: { s: Styles; slices: Slice[]; color: string }) {
  const total = slices.reduce((sum, x) => sum + x.cents, 0);
  const max = slices[0].cents;
  return (
    <View style={s.bars}>
      {slices.map((x) => (
        <View key={x.label}>
          <View style={s.barHead}>
            <Text style={s.barLabel} numberOfLines={1}>
              {x.label}
            </Text>
            <Text style={s.barValue}>
              {brl(x.cents)} · {Math.round((x.cents / total) * 100)}%
            </Text>
          </View>
          <View style={s.track}>
            <View style={[s.fill, { width: `${Math.max(3, Math.round((x.cents / max) * 100))}%`, backgroundColor: color }]} />
          </View>
        </View>
      ))}
    </View>
  );
}

const CHART_H = 110;

/** One column per month with the spending, all drawn to the same scale. */
export function Evolution({ s, series, highlightLast = true }: { s: Styles; series: MonthPoint[]; highlightLast?: boolean }) {
  const t = useTheme();
  const max = Math.max(1, ...series.map((p) => p.expense));
  const many = series.length > 6; // 12 columns: no room for the value above each bar
  const h = (v: number) => (v <= 0 ? 0 : Math.max(4, Math.round((v / max) * CHART_H)));
  return (
    <View style={s.evo}>
      {series.map((p, i) => {
        const now = highlightLast && i === series.length - 1;
        return (
          <View key={p.month} style={s.evoCol}>
            {!many && (
              <Text style={s.evoValue} numberOfLines={1}>
                {p.expense > 0 ? brl(p.expense).replace(/,00$/, '') : '—'}
              </Text>
            )}
            <View style={[s.evoBars, { height: CHART_H }]}>
              <View style={[s.evoBar, many && s.evoBarThin, { height: h(p.expense), backgroundColor: now ? t.red : t.borderStrong }]} />
            </View>
            <Text style={[s.evoMonth, now && s.evoMonthNow]}>{monthShort(p.month)}</Text>
          </View>
        );
      })}
    </View>
  );
}

export const makeStyles = (t: Theme) =>
  StyleSheet.create({
    flex1: { flex: 1 },
    body: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24, gap: 12 },
    card: { backgroundColor: t.surface, borderRadius: 18, borderWidth: 1, borderColor: t.border, padding: 14, gap: 10 },
    cardTitle: { fontSize: 13, fontWeight: '800', color: t.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
    kpis: { flexDirection: 'row', gap: 10 },
    kpi: { flex: 1 },
    kpiLabel: { fontSize: 12, color: t.textMuted, fontWeight: '600' },
    kpiValue: { fontSize: 20, fontWeight: '800', marginTop: 2 },
    note: { fontSize: 13, color: t.text, lineHeight: 18 },
    empty: { fontSize: 13, color: t.textFaint },
    bars: { gap: 12 },
    barHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5, gap: 8 },
    barLabel: { flex: 1, fontSize: 14, fontWeight: '600', color: t.text },
    barValue: { fontSize: 13, fontWeight: '700', color: t.textMuted },
    track: { height: 10, borderRadius: 5, backgroundColor: t.surfaceAlt, overflow: 'hidden' },
    fill: { height: 10, borderRadius: 5 },
    evo: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
    evoCol: { flex: 1, alignItems: 'center' },
    evoBars: { flexDirection: 'row', alignItems: 'flex-end', gap: 3 },
    evoBar: { width: 22, borderTopLeftRadius: 5, borderTopRightRadius: 5 },
    evoBarThin: { width: 14 },
    evoMonth: { marginTop: 6, fontSize: 12, fontWeight: '600', color: t.textMuted },
    evoMonthNow: { color: t.link, fontWeight: '800' },
    evoValue: { fontSize: 10, color: t.textMuted, marginBottom: 4, fontWeight: '600' },
  });
