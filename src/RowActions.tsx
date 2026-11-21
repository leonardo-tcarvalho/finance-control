import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { gainLabel, gainOf, titleOf } from './calc';
import Field from './Field';
import Sheet from './Sheet';
import { isPending, payKind } from './status';
import { Theme, useTheme } from './theme';
import { Card, Transaction } from './types';
import { brl, centsToField, parseMoneyToCents, shortDate } from './utils';

interface Props {
  /** the row that was tapped, or null when closed */
  tx: Transaction | null;
  cards: Card[];
  onClose: () => void;
  onTogglePaid: (tx: Transaction) => void;
  /** investments only: new current value in cents (already a whole number >= 0) */
  onUpdateValue: (tx: Transaction, cents: number) => void;
  onEdit: (tx: Transaction) => void;
  onDelete: (tx: Transaction) => void;
}

/** What can be done with a row: mark it paid or pending (expenses), edit it, delete it. */
export default function RowActions({ tx, cards, onClose, onTogglePaid, onUpdateValue, onEdit, onDelete }: Props) {
  const t = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);
  const kind = tx ? payKind(tx) : 'none';
  const pending = tx ? isPending(tx, cards) : false;
  const isInv = tx?.type === 'investment';
  const [valueText, setValueText] = useState<string | null>(null); // null = not typing a new current value
  useEffect(() => setValueText(null), [tx?.id]);
  const sign = isInv ? '→' : tx?.type === 'expense' ? '−' : '+';

  return (
    <Sheet
      visible={tx !== null}
      title={tx ? titleOf(tx) : ''}
      onClose={onClose}
      footer={
        <>
          <Pressable onPress={valueText === null ? onClose : () => setValueText(null)} style={s.cancel} accessibilityRole="button">
            <Text style={s.cancelText}>Cancelar</Text>
          </Pressable>
          {tx && valueText !== null && (
            <Pressable
              onPress={() => {
                const cents = parseMoneyToCents(valueText);
                if (!Number.isFinite(cents)) return Alert.alert('Valor atual inválido', 'Informe um valor como 1.234,56.');
                onUpdateValue(tx, cents);
              }}
              style={[s.cancel, { backgroundColor: t.primary, borderColor: t.primary, flex: 2 }]}
              accessibilityRole="button"
            >
              <Text style={[s.cancelText, { color: t.onPrimary }]}>Salvar valor atual</Text>
            </Pressable>
          )}
        </>
      }
    >
      {tx && valueText !== null ? (
        <Field label="Novo valor atual" prefix="R$" placeholder="0,00" keyboardType="decimal-pad" value={valueText} onChangeText={setValueText} autoFocus big />
      ) : (
        tx && (
        <>
          <Text style={s.info}>
            {shortDate(tx.date)} · {sign} {brl(tx.amountCents)}
          </Text>
          {isInv && (
            <Text style={s.info}>
              🏦 {tx.bank ?? ''}
              {tx.currentValueCents !== undefined && (
                <Text style={{ color: gainOf(tx) < 0 ? t.red : gainOf(tx) > 0 ? t.green : t.textMuted }}>
                  {'  ·  '}Hoje {brl(tx.currentValueCents)} · {gainLabel(tx)}
                </Text>
              )}
            </Text>
          )}

          {/* only expenses paid outside a card carry their own status; a card purchase follows its invoice */}
          {kind === 'other' && (
            <Action
              s={s}
              label={pending ? 'Marcar como pago' : 'Marcar como pendente'}
              hint={pending ? 'O dinheiro já saiu' : 'Volta a contar como pendente'}
              color={pending ? t.green : t.amber}
              onPress={() => onTogglePaid(tx)}
            />
          )}
          {kind === 'card' && <Text style={s.note}>Compra no cartão: ela fica paga quando a fatura inteira é marcada como paga.</Text>}

          {isInv && (
            <Action s={s} label="Atualizar valor atual" hint="Informe quanto vale hoje para ver o rendimento" color={t.primary} onPress={() => setValueText(centsToField(tx.currentValueCents ?? tx.amountCents))} />
          )}
          <Action s={s} label="Editar" hint="Mudar valor, data, categoria e outros dados" color={t.link} onPress={() => onEdit(tx)} />
          <Action s={s} label="Excluir" hint={tx.installment || tx.recurring ? 'Escolha só esta ou todas' : 'Remove este lançamento'} color={t.red} onPress={() => onDelete(tx)} />
        </>
        )
      )}
    </Sheet>
  );
}

function Action({ s, label, hint, color, onPress }: { s: ReturnType<typeof makeStyles>; label: string; hint: string; color: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.action, pressed && { opacity: 0.7 }]} accessibilityRole="button">
      <View style={[s.dot, { backgroundColor: color }]} />
      <View style={s.actionText}>
        <Text style={[s.actionLabel, { color }]}>{label}</Text>
        <Text style={s.actionHint}>{hint}</Text>
      </View>
      <Text style={s.chevron}>›</Text>
    </Pressable>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    info: { fontSize: 14, fontWeight: '700', color: t.textMuted, marginTop: -4 },
    note: { fontSize: 12, lineHeight: 17, color: t.textMuted, backgroundColor: t.surfaceAlt, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
    action: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1, borderColor: t.border, backgroundColor: t.surface },
    dot: { width: 10, height: 10, borderRadius: 5 },
    actionText: { flex: 1 },
    actionLabel: { fontSize: 16, fontWeight: '800' },
    actionHint: { fontSize: 12, color: t.textMuted, marginTop: 2 },
    chevron: { fontSize: 22, color: t.textFaint, marginTop: -2 },
    cancel: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 12, paddingVertical: 14, borderWidth: 1.5, borderColor: t.border, backgroundColor: t.surface },
    cancelText: { fontSize: 15, fontWeight: '700', color: t.text },
  });
