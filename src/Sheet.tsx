import { ComponentRef, ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Theme, useTheme } from './theme';

interface Props {
  visible: boolean;
  title: string;
  onClose: () => void;
  /** true when the user already typed something: tapping outside then only hides the keyboard */
  dirty?: boolean;
  /** buttons row pinned to the bottom of the sheet */
  footer: ReactNode;
  children: ReactNode;
}

/** Bottom-sheet popup shared by the forms: backdrop, header with close button, scrollable body and footer. */
export default function Sheet({ visible, title, onClose, dirty = false, footer, children }: Props) {
  const t = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);
  const insets = useSafeAreaInsets();

  // Android: the Modal window is not always resized when the keyboard opens, so measure how much
  // of the sheet the keyboard actually covers and lift the sheet by exactly that (0 if already clear).
  const sheetRef = useRef<ComponentRef<typeof View>>(null);
  const [lift, setLift] = useState(0);
  useEffect(() => {
    if (!visible || Platform.OS !== 'android') return;
    const show = Keyboard.addListener('keyboardDidShow', (e) => {
      sheetRef.current?.measureInWindow((_x, y, _w, h) => setLift(Math.max(0, y + h - e.endCoordinates.screenY)));
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => setLift(0));
    return () => {
      show.remove();
      hide.remove();
      setLift(0);
    };
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[s.backdrop, { paddingBottom: lift }]}>
        <Pressable style={s.backdropTap} onPress={() => (dirty ? Keyboard.dismiss() : onClose())} />

        <View ref={sheetRef} style={[s.sheet, { paddingBottom: 12 + insets.bottom }]}>
          <View style={s.header}>
            <Text style={s.title} numberOfLines={1}>
              {title}
            </Text>
            <Pressable onPress={onClose} hitSlop={12} style={s.closeBtn} accessibilityLabel="Fechar">
              <Text style={s.closeText}>✕</Text>
            </Pressable>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.body}>
            {children}
          </ScrollView>

          <View style={s.actions}>{footer}</View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: t.overlay },
    backdropTap: { flex: 1 },
    sheet: { backgroundColor: t.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18, maxHeight: '92%', paddingTop: 6 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10 },
    title: { fontSize: 18, fontWeight: '800', color: t.text, flex: 1, marginRight: 12 },
    closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: t.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
    closeText: { fontSize: 14, fontWeight: '800', color: t.text },
    body: { paddingHorizontal: 16, paddingBottom: 8, gap: 14 },
    actions: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 10, borderTopWidth: 1, borderTopColor: t.border },
  });
