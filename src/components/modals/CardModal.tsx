import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import Field from '../common/Field';
import Sheet from '../common/Sheet';
import { Theme, useTheme } from '../../theme';
import { Card } from '../../domain/types';
import { centsToField, parseMoneyToCents } from '../../utils';

export interface CardValues {
  name: string;
  limitCents: number;
  /** day of the month, 1 to 31 */
  closingDay: number;
  dueDay: number;
}

interface Props {
  visible: boolean;
  /** the card being edited, or null to register a new one */
  card: Card | null;
  onClose: () => void;
  /** returns true when saved (the popup then closes) */
  onSave: (v: CardValues) => boolean;
  /** only offered when editing */
  onDelete?: () => void;
}

const toField = (cents: number | undefined) => (cents ? centsToField(cents) : '');

export default function CardModal({ visible, card, onClose, onSave, onDelete }: Props) {
  const t = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);
  const [name, setName] = useState('');
  const [limit, setLimit] = useState('');
  const [closing, setClosing] = useState('');
  const [due, setDue] = useState('');

  useEffect(() => {
    if (!visible) return;
    setName(card?.name ?? '');
    setLimit(toField(card?.limitCents));
    setClosing(card?.closingDay ? String(card.closingDay) : '');
    setDue(card?.dueDay ? String(card.dueDay) : '');
  }, [visible, card?.id]);

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return Alert.alert('Nome do cartão', 'Informe um nome para o cartão.');
    const limitCents = parseMoneyToCents(limit);
    if (!Number.isFinite(limitCents) || limitCents <= 0) return Alert.alert('Limite obrigatório', 'Informe o limite do cartão, um valor maior que zero.');
    const day = (text: string): number | null => {
      const n = Number(text);
      return text.trim() !== '' && Number.isInteger(n) && n >= 1 && n <= 31 ? n : null;
    };
    const closingDay = day(closing);
    if (closingDay === null) return Alert.alert('Fechamento obrigatório', 'Informe o dia do mês em que a fatura fecha (de 1 a 31).');
    const dueDay = day(due);
    if (dueDay === null) return Alert.alert('Vencimento obrigatório', 'Informe o dia do mês em que a fatura vence (de 1 a 31).');
    if (onSave({ name: trimmed, limitCents, closingDay, dueDay })) onClose();
  };

  return (
    <Sheet
      visible={visible}
      title={card ? 'Editar cartão' : 'Novo cartão'}
      onClose={onClose}
      dirty={name !== (card?.name ?? '') || limit !== toField(card?.limitCents) || closing !== (card?.closingDay ? String(card.closingDay) : '') || due !== (card?.dueDay ? String(card.dueDay) : '')}
      footer={
        <>
          <Pressable onPress={onClose} style={[s.btn, s.btnGhost]} accessibilityRole="button">
            <Text style={s.btnGhostText}>Cancelar</Text>
          </Pressable>
          <Pressable onPress={submit} style={[s.btn, { backgroundColor: t.primary, flex: 2 }]} accessibilityRole="button">
            <Text style={[s.btnText, { color: t.onPrimary }]}>{card ? 'Salvar' : 'Cadastrar cartão'}</Text>
          </Pressable>
        </>
      }
    >
      <Field label="Nome do cartão" placeholder="Ex.: Nubank, Itaú, Riachuelo…" value={name} onChangeText={setName} autoFocus={!card} />
      <Field label="Limite" prefix="R$" placeholder="0,00" keyboardType="decimal-pad" value={limit} onChangeText={setLimit} big />
      <Text style={s.help}>Usado para mostrar quanto ainda está disponível no cartão.</Text>

      <View style={s.daysRow}>
        <Field label="Fecha no dia" placeholder="Ex.: 10" keyboardType="number-pad" maxLength={2} value={closing} onChangeText={(v) => setClosing(v.replace(/\D/g, ''))} style={{ flex: 1 }} />
        <Field label="Vence no dia" placeholder="Ex.: 17" keyboardType="number-pad" maxLength={2} value={due} onChangeText={(v) => setDue(v.replace(/\D/g, ''))} style={{ flex: 1 }} />
      </View>
      <Text style={s.help}>Compras feitas depois do dia de fechamento entram na fatura seguinte. O vencimento define quando a fatura fica vencida.</Text>

      {card && onDelete && (
        <Pressable onPress={onDelete} style={s.delete} accessibilityRole="button">
          <Text style={s.deleteText}>Remover este cartão</Text>
        </Pressable>
      )}
    </Sheet>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    daysRow: { flexDirection: 'row', gap: 10 },
    help: { fontSize: 12, color: t.textMuted, lineHeight: 17, marginTop: -4 },
    delete: { alignSelf: 'flex-start', paddingVertical: 6 },
    deleteText: { color: t.red, fontWeight: '700', fontSize: 14 },
    btn: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 12, paddingVertical: 14 },
    btnGhost: { borderWidth: 1.5, borderColor: t.border, backgroundColor: t.surface },
    btnGhostText: { fontSize: 15, fontWeight: '700', color: t.text },
    btnText: { fontSize: 15, fontWeight: '800' },
  });
