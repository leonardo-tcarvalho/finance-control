import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';

const logo = require('../../../assets/splash-icon.png');

/**
 * Shown while the saved data is being read. It repeats the native splash (same color, same centered logo), so the
 * change between them is not noticeable. The native splash itself is hidden by App, not here.
 */
export default function LoadingScreen() {
  return (
    <View style={s.root}>
      <Image source={logo} style={s.logo} resizeMode="contain" accessibilityIgnoresInvertColors />
      <View style={s.textBox}>
        <Text style={s.title}>Controle de Gastos</Text>
        <Text style={s.tagline}>Suas finanças, simples e no seu bolso</Text>
        <ActivityIndicator color="#e0e7ff" style={s.spinner} accessibilityLabel="Carregando" />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#4f46e5', alignItems: 'center', justifyContent: 'center' },
  logo: { width: 220, height: 220 },
  textBox: { position: 'absolute', top: '50%', marginTop: 130, alignItems: 'center', paddingHorizontal: 24 },
  title: { fontSize: 26, fontWeight: '800', color: '#ffffff', textAlign: 'center' },
  tagline: { fontSize: 14, color: '#e0e7ffe6', marginTop: 6, textAlign: 'center' },
  spinner: { marginTop: 28 },
});
