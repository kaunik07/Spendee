// Persistent left sidebar nav for the web app — replaces the mobile bottom
// tab bar. Approved via the brainstorming visual companion mockup.
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, usePathname } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors } from '@/constants/theme';

interface NavItem {
  href: string;
  label: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  match: (pathname: string) => boolean;
}

const NAV_ITEMS: NavItem[] = [
  { href: '/',         label: 'Home',     icon: 'home-variant',    match: (p) => p === '/' },
  { href: '/expenses', label: 'Expenses', icon: 'receipt-text',    match: (p) => p.startsWith('/expenses') || p.startsWith('/edit-expense') },
  { href: '/budget',   label: 'Budget',   icon: 'target',          match: (p) => p.startsWith('/budget') },
  { href: '/savings',  label: 'Savings',  icon: 'piggy-bank',      match: (p) => p.startsWith('/savings') },
  { href: '/summary',  label: 'Summary',  icon: 'chart-box',       match: (p) => p.startsWith('/summary') },
  { href: '/import-statement', label: 'Import', icon: 'file-upload-outline', match: (p) => p.startsWith('/import-statement') },
];

const FOOTER_ITEMS: NavItem[] = [
  { href: '/profile',  label: 'Profile',  icon: 'account-circle',  match: (p) => p.startsWith('/profile') || p.startsWith('/account') || p.startsWith('/credit-card') },
  { href: '/settings', label: 'Settings', icon: 'cog-outline',     match: (p) => p.startsWith('/settings') },
];

export default function WebSidebar({ collapsed }: { collapsed: boolean }) {
  const router = useRouter();
  const pathname = usePathname();

  const renderItem = (item: NavItem) => {
    const active = item.match(pathname);
    return (
      <Pressable
        key={item.href}
        onPress={() => router.push(item.href as any)}
        style={({ hovered }: any) => [
          styles.navItem,
          collapsed && styles.navItemCollapsed,
          active && styles.navItemActive,
          !active && hovered && styles.navItemHovered,
        ]}>
        <MaterialCommunityIcons
          name={item.icon}
          size={20}
          color={active ? Colors.onPrimary : Colors.textSecondary}
        />
        {!collapsed && (
          <Text style={[styles.navLabel, active && styles.navLabelActive]}>{item.label}</Text>
        )}
      </Pressable>
    );
  };

  return (
    <View style={[styles.sidebar, collapsed && styles.sidebarCollapsed]}>
      <View style={styles.logoRow}>
        <View style={styles.logoMark}>
          <MaterialCommunityIcons name="wallet-outline" size={18} color={Colors.primary} />
        </View>
        {!collapsed && <Text style={styles.logoText}>Spendee</Text>}
      </View>

      <View style={styles.navList}>{NAV_ITEMS.map(renderItem)}</View>

      <View style={styles.spacer} />

      <View style={styles.footer}>{FOOTER_ITEMS.map(renderItem)}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  sidebar: {
    width: 220,
    backgroundColor: Colors.background,
    borderRightWidth: 1,
    borderRightColor: Colors.border,
    paddingVertical: 20,
    paddingHorizontal: 14,
  },
  sidebarCollapsed: { width: 72, paddingHorizontal: 12, alignItems: 'center' },

  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, paddingBottom: 22 },
  logoMark: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: Colors.primaryMuted,
    borderWidth: 1, borderColor: Colors.primary + '55',
    alignItems: 'center', justifyContent: 'center',
  },
  logoText: { color: Colors.text, fontWeight: '800', fontSize: 16, letterSpacing: -0.3 },

  navList: { gap: 4 },
  navItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 10, paddingHorizontal: 12,
    borderRadius: 10,
  },
  navItemCollapsed: { width: 44, justifyContent: 'center', paddingHorizontal: 0 },
  navItemActive: { backgroundColor: Colors.primary },
  navItemHovered: { backgroundColor: Colors.surface },
  navLabel: { color: Colors.textSecondary, fontSize: 14, fontWeight: '600' },
  navLabelActive: { color: Colors.onPrimary },

  spacer: { flex: 1 },

  footer: { borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 10, marginTop: 6, gap: 4 },
});
