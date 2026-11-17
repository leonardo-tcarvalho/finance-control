import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Theme, useTheme } from './theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
}

const DURATION = 220;

/**
 * Side menu that slides in from the left over a dimmed backdrop. Tapping the backdrop or the system back button
 * closes it. Built with Animated and Modal only, so it needs no native library.
 */
export default function Drawer({ visible, onClose, children }: Props) {
  const t = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const panelWidth = Math.min(340, Math.round(width * 0.84));

  // `mounted` keeps the Modal alive while the closing animation plays
  const [mounted, setMounted] = useState(visible);
  const progress = useRef(new Animated.Value(visible ? 1 : 0)).current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.timing(progress, { toValue: 1, duration: DURATION, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    } else if (mounted) {
      Animated.timing(progress, { toValue: 0, duration: DURATION, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
  }, [visible]);

  const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [-panelWidth, 0] });

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={s.root}>
        <Animated.View style={[s.backdrop, { opacity: progress }]}>
          <Pressable style={s.fill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Fechar menu" />
        </Animated.View>
        <Animated.View style={[s.panel, { width: panelWidth, paddingTop: insets.top + 8, paddingBottom: insets.bottom + 8, transform: [{ translateX }] }]}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.content}>
            {children}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

/** Small uppercase heading that separates groups inside the menu. */
export function DrawerSection({ title }: { title: string }) {
  const t = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);
  return <Text style={s.section}>{title}</Text>;
}

interface ItemProps {
  /** an emoji, or any element (e.g. a drawn icon) */
  icon: ReactNode;
  label: string;
  /** second line, smaller */
  sub?: string;
  active?: boolean;
  onPress: () => void;
}

/** One tappable row of the menu. */
export function DrawerItem({ icon, label, sub, active, onPress }: ItemProps) {
  const t = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.item, active && s.itemOn, pressed && { opacity: 0.7 }]} accessibilityRole="button" accessibilityState={{ selected: !!active }}>
      {typeof icon === 'string' ? <Text style={s.icon}>{icon}</Text> : <View style={s.iconBox}>{icon}</View>}
      <View style={s.itemText}>
        <Text style={[s.label, active && s.labelOn]} numberOfLines={1}>
          {label}
        </Text>
        {sub ? (
          <Text style={s.sub} numberOfLines={1}>
            {sub}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

export const DrawerDivider = () => {
  const t = useTheme();
  return <View style={{ height: 1, backgroundColor: t.border, marginVertical: 10 }} />;
};

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    root: { flex: 1, flexDirection: 'row' },
    fill: { flex: 1 },
    backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: t.overlay },
    panel: { position: 'absolute', top: 0, bottom: 0, left: 0, backgroundColor: t.surface, borderTopRightRadius: 20, borderBottomRightRadius: 20, elevation: 16, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 12 },
    content: { paddingHorizontal: 12, paddingBottom: 12 },
    section: { fontSize: 11, fontWeight: '800', color: t.textFaint, textTransform: 'uppercase', letterSpacing: 0.8, paddingHorizontal: 12, marginTop: 14, marginBottom: 4 },
    item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 12, borderRadius: 12 },
    itemOn: { backgroundColor: t.primarySoft },
    icon: { fontSize: 18, width: 26, textAlign: 'center' },
    iconBox: { width: 26, alignItems: 'center', justifyContent: 'center' },
    itemText: { flex: 1 },
    label: { fontSize: 15, fontWeight: '600', color: t.text },
    labelOn: { color: t.link, fontWeight: '800' },
    sub: { fontSize: 11, color: t.textMuted, marginTop: 1 },
  });
