// Authenticated app shell for web: sidebar + scrollable content outlet.
// Desktop-first with a graceful narrow-width fallback (sidebar collapses to
// icons below ~900px) — not pixel-tuned for mobile-web, just not broken.
import React from 'react';
import { ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Colors } from '@/constants/theme';
import WebSidebar from './WebSidebar';

const COLLAPSE_BREAKPOINT = 900;

export default function WebLayout({ children }: { children: React.ReactNode }) {
  const { width } = useWindowDimensions();
  const collapsed = width < COLLAPSE_BREAKPOINT;

  return (
    <View style={styles.root}>
      <WebSidebar collapsed={collapsed} />
      <ScrollView style={styles.main} contentContainerStyle={styles.mainContent} showsVerticalScrollIndicator={false}>
        {children}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row', backgroundColor: Colors.surface, minHeight: '100%' as any },
  main: { flex: 1 },
  mainContent: { padding: 32, maxWidth: 1200, width: '100%', alignSelf: 'center' },
});
