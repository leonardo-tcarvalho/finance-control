import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text } from 'react-native';
import Field from './Field';
import Sheet from './Sheet';
import { Theme, useTheme } from './theme';
import { centsToField, parseMoneyToCents } from './utils';

interface Props {
  visible: boolean;
  /** current goal in cents, or undefined when none */
  goalCents?: number;
  onClose: () => void;
  /** null removes the goal */
  onSave: (cents: number | null) => void;
}

export default function BudgetModal({ visible, goalCents, onClose, onSave }: Props) {
  const t = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);
  const [value, setValue] = useState('');

  useEffect(() => {
    if (visible) setValue(goalCents ? centsToField(goalCents) : '');
  }, [visible, goalCents]);

  const submit = () => {
    if (value.trim() === '') {
      onSave(null);
      return onClose();
    }
    const cents = parseMoneyToCents(value);
    if (!Number.isFinite(cents) || cents <= 0) return Alert.alert('Valor inválido', 'Informe um valor maior que zero, ou deixe em branco para remover a meta.');
    onSave(cents);
    onClose();
  };

  return (
    <Sheet
      visible={visible}
      title="Meta de gastos do mês"
      onClose={onClose}
      dirty={value !== (goalCents ? centsToField(goalCents) : '')}
      footer={
        <>
          <Pressable onPress={onClose} style={[s.btn, s.btnGhost]}>
            <Text style={s.btnGhostText}>Cancelar</Text>
          </Pressable>
          <Pressable onPress={submit} style={[s.btn, { backgroundColor: t.primary, flex: 2 }]}>
            <Text style={[s.btnText, { color: t.onPrimary }]}>Salvar meta</Text>
          </Pressable>
        </>
      }
    >
      <Field label="Quanto você planeja gastar por mês" prefix="R$" placeholder="0,00" keyboardType="decimal-pad" value={value} onChangeText={setValue} autoFocus big />
      <Text style={s.help}>O app avisa quando os gastos chegarem a 80% da meta e quando ela for ultrapassada. Estornos descontam do gasto. Deixe em branco para remover a meta.</Text>
    </Sheet>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    help: { fontSize: 12, color: t.textMuted, lineHeight: 17 },
    btn: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 12, paddingVertical: 14 },
    btnGhost: { borderWidth: 1.5, borderColor: t.border, backgroundColor: t.surface },
    btnGhostText: { fontSize: 15, fontWeight: '700', color: t.text },
    btnText: { fontSize: 15, fontWeight: '800' },
  });
