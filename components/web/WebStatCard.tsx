import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors } from '@/constants/theme';

interface Props {
  label: string;
  value: string;
  valueColor?: string;
  note?: string;
  onPress?: () => void;
}

export default function WebStatCard({ label, value, valueColor, note, onPress }: Props) {
  const Wrapper: any = onPress ? Pressable : View;
  return (
    <Wrapper style={styles.card} onPress={onPress}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, valueColor ? { color: valueColor } : null]}>{value}</Text>
      {note ? <Text style={styles.note}>{note}</Text> : null}
    </Wrapper>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: Colors.surfaceContainer,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 16,
    padding: 18,
  },
  label: { color: Colors.outline, fontSize: 11.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.05, marginBottom: 8 },
  value: { color: Colors.text, fontSize: 22, fontWeight: '800' },
  note: { color: Colors.textSecondary, fontSize: 12, marginTop: 6 },
});
