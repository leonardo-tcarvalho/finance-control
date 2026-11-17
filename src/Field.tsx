import { useMemo, useState } from 'react';
import { KeyboardTypeOptions, StyleProp, StyleSheet, Text, TextInput, View, ViewStyle } from 'react-native';
import { Theme, useTheme } from './theme';

function useStyles() {
  const t = useTheme();
  return useMemo(() => makeStyles(t), [t]);
}

/** Small bold caption used above inputs and chip rows. */
export function Label({ children }: { children: string }) {
  const s = useStyles();
  return <Text style={s.label}>{children}</Text>;
}

export interface FieldProps {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  maxLength?: number;
  prefix?: string;
  suffix?: string;
  autoFocus?: boolean;
  big?: boolean;
  onSubmitEditing?: () => void;
  style?: StyleProp<ViewStyle>;
}

// bordered, labelled input; the border highlights while it is being edited
export default function Field({ label, prefix, suffix, big, style, ...input }: FieldProps) {
  const t = useTheme();
  const s = useStyles();
  const [focused, setFocused] = useState(false);
  return (
    <View style={style}>
      <Text style={s.label}>{label}</Text>
      <View style={[s.field, focused && s.fieldFocus]}>
        {prefix && <Text style={s.affix}>{prefix}</Text>}
        <TextInput
          {...input}
          placeholderTextColor={t.textFaint}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={[s.fieldInput, big && s.fieldInputBig]}
        />
        {suffix && <Text style={s.affix}>{suffix}</Text>}
      </View>
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    label: { fontSize: 13, fontWeight: '700', color: t.text, marginBottom: 6 },
    field: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: t.borderStrong, borderRadius: 10, backgroundColor: t.surface, paddingHorizontal: 12, minHeight: 50 },
    fieldFocus: { borderColor: t.link, backgroundColor: t.focusBg },
    fieldInput: { flex: 1, fontSize: 16, color: t.text, paddingVertical: 8 },
    fieldInputBig: { fontSize: 20, fontWeight: '700' },
    affix: { fontSize: 15, fontWeight: '700', color: t.textMuted, marginHorizontal: 4 },
  });
