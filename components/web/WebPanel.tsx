import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors } from '@/constants/theme';

interface Props {
  title: string;
  linkLabel?: string;
  onLinkPress?: () => void;
  children: React.ReactNode;
  style?: any;
}

export default function WebPanel({ title, linkLabel, onLinkPress, children, style }: Props) {
  return (
    <View style={[styles.panel, style]}>
      <View style={styles.head}>
        <Text style={styles.title}>{title}</Text>
        {linkLabel && onLinkPress && (
          <Pressable onPress={onLinkPress}>
            <Text style={styles.link}>{linkLabel}</Text>
          </Pressable>
        )}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: Colors.surfaceContainer,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 16,
    padding: 20,
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  title: { color: Colors.text, fontSize: 15, fontWeight: '700' },
  link: { color: Colors.primary, fontSize: 12.5, fontWeight: '700' },
});
