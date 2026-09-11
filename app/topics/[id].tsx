// Native stub. Topics is web-only for v1 — see the design doc. This screen
// exists only so /topics has SOME route on native: app/_layout.tsx
// registers every screen in one shared <Stack>, so a web-only file
// (topics.web.tsx) would otherwise leave native with no match for that
// name at all. Copies app/import-statement.tsx's exact pattern.
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '@/constants/theme';

export default function TopicDetailScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Topics</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.body}>
        <View style={styles.iconWrap}>
          <MaterialCommunityIcons name="folder-multiple-outline" size={28} color={Colors.primary} />
        </View>
        <Text style={styles.title}>Available on the web app</Text>
        <Text style={styles.sub}>
          Grouping expenses into topics is a web-only feature for now — open
          Spendee on the web to create and manage topics.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
  },
  headerTitle: { color: Colors.text, fontSize: 16, fontWeight: '700' },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  iconWrap: {
    width: 56, height: 56, borderRadius: 18,
    backgroundColor: Colors.primaryMuted,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 18,
  },
  title: { color: Colors.text, fontSize: 17, fontWeight: '700', textAlign: 'center' },
  sub: { color: Colors.textSecondary, fontSize: 13.5, textAlign: 'center', marginTop: 8, lineHeight: 19 },
});
