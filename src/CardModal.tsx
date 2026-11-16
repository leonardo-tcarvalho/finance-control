import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text } from 'react-native';
import Field from './Field';
import Sheet from './Sheet';
import { Theme, useTheme } from './theme';
import { Card } from './types';

export interface CardValues {
  name: string;
  /** null = no limit set */
  limitCents: number | null;
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

const toField = (cents: number | undefined) => (cents ? (cents / 100).toFixed(2).replace('.', ',') : '');

export default function CardModal({ visible, card, onClose, onSave, onDelete }: Props) {
  const t = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);
  const [name, setName] = useState('');
  const [limit, setLimit] = useState('');

  useEffect(() => {
    if (!visible) return;
    setName(card?.name ?? '');
    setLimit(toField(card?.limitCents));
  }, [visible, card?.id]);

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return Alert.alert('Nome do cartão', 'Informe um nome para o cartão.');
    let limitCents: number | null = null;
    if (limit.trim() !== '') {
      const cents = Math.round(parseFloat(limit.replace(/\./g, '').replace(',', '.')) * 100);
      if (!Number.isFinite(cents) || cents <= 0) return Alert.alert('Limite inválido', 'Informe um valor maior que zero, ou deixe em branco.');
      limitCents = cents;
    }
    if (onSave({ name: trimmed, limitCents })) onClose();
  };

  return (
    <Sheet
      visible={visible}
      title={card ? 'Editar cartão' : 'Novo cartão'}
      onClose={onClose}
      dirty={name !== (card?.name ?? '') || limit !== toField(card?.limitCents)}
      footer={
        <>
          <Pressable onPress={onClose} style={[s.btn, s.btnGhost]}>
            <Text style={s.btnGhostText}>Cancelar</Text>
          </Pressable>
          <Pressable onPress={submit} style={[s.btn, { backgroundColor: t.primary, flex: 2 }]}>
            <Text style={[s.btnText, { color: t.onPrimary }]}>{card ? 'Salvar' : 'Cadastrar cartão'}</Text>
          </Pressable>
        </>
      }
    >
      <Field label="Nome do cartão" placeholder="Ex.: Nubank, Itaú, Riachuelo…" value={name} onChangeText={setName} autoFocus={!card} />
      <Field label="Limite (opcional)" prefix="R$" placeholder="0,00" keyboardType="decimal-pad" value={limit} onChangeText={setLimit} big />
      <Text style={s.help}>Com o limite informado, a aba do cartão mostra quanto ainda está disponível.</Text>

      {card && onDelete && (
        <Pressable onPress={onDelete} style={s.delete}>
          <Text style={s.deleteText}>Remover este cartão</Text>
        </Pressable>
      )}
    </Sheet>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    help: { fontSize: 12, color: t.textMuted, lineHeight: 17, marginTop: -4 },
    delete: { alignSelf: 'flex-start', paddingVertical: 6 },
    deleteText: { color: t.red, fontWeight: '700', fontSize: 14 },
    btn: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 12, paddingVertical: 14 },
    btnGhost: { borderWidth: 1.5, borderColor: t.border, backgroundColor: t.surface },
    btnGhostText: { fontSize: 15, fontWeight: '700', color: t.text },
    btnText: { fontSize: 15, fontWeight: '800' },
  });
