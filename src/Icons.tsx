import { StyleSheet, View } from 'react-native';

interface IconProps {
  color: string;
  size?: number;
}

const STROKE = 2;

/**
 * Arrow over a base line, drawn with plain views so it takes the theme's text color (no icon font needed).
 * Pointing up reads as "send out" (export); pointing down as "bring in" (restore).
 */
export function TrayArrow({ dir, color, size = 20 }: IconProps & { dir: 'up' | 'down' }) {
  const head = Math.round(size * 0.42);
  const stemH = Math.round(size * 0.55);
  return (
    <View style={{ width: size, height: size, alignItems: 'center' }}>
      {/* base line */}
      <View style={{ position: 'absolute', bottom: 1, width: size * 0.8, height: STROKE, borderRadius: 1, backgroundColor: color }} />
      {/* stem */}
      <View style={{ position: 'absolute', top: 1, width: STROKE, height: stemH, borderRadius: 1, backgroundColor: color }} />
      {/* arrow head: a square with two borders, turned 45 degrees */}
      <View
        style={{
          position: 'absolute',
          top: dir === 'up' ? 1 : stemH - head * 0.55,
          width: head,
          height: head,
          borderLeftWidth: STROKE,
          borderTopWidth: STROKE,
          borderColor: color,
          transform: [{ rotate: dir === 'up' ? '45deg' : '225deg' }],
        }}
      />
    </View>
  );
}

/** A plus sign for "add". */
export function PlusIcon({ color, size = 20 }: IconProps) {
  const len = Math.round(size * 0.7);
  return (
    <View style={[styles.center, { width: size, height: size }]}>
      <View style={{ position: 'absolute', width: len, height: STROKE, borderRadius: 1, backgroundColor: color }} />
      <View style={{ position: 'absolute', width: STROKE, height: len, borderRadius: 1, backgroundColor: color }} />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
});
