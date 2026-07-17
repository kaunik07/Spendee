import { MaterialCommunityIcons } from '@expo/vector-icons';
import BottomSheet from '@gorhom/bottom-sheet';
import React, { useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AddSavingSheet from '@/components/AddSavingSheet';
import { Colors } from '@/constants/theme';
import { useSavingsContext } from '@/store/SavingsContext';
import { Saving } from '@/store/useSavings';

const GOLD = '#FFD666';
const GOLD_MUTED = '#FFD66622';
const ON_GOLD = '#3A2E00';

export default function SavingsScreen() {
  const sheetRef = useRef<BottomSheet>(null);
  const { savings, totalSaved, resetSavings, deleteSaving, refresh } = useSavingsContext();

  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = async () => {
    setRefreshing(true);
    refresh();
    setTimeout(() => setRefreshing(false), 800);
  };

  const total = totalSaved();

  const handleReset = () => {
    Alert.alert(
      'Reset Savings?',
      'This will clear all your saved entries and reset the counter to $0. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: resetSavings,
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <FlatList
        data={savings}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={GOLD} />}
        ListHeaderComponent={
          <>
            {/* Header */}
            <View style={styles.header}>
              <View>
                <Text style={styles.title}>Savings Jar</Text>
                <Text style={styles.subtitle}>Money you chose not to spend</Text>
              </View>
              <View style={styles.headerIcon}>
                <MaterialCommunityIcons name="piggy-bank-outline" size={22} color={GOLD} />
              </View>
            </View>

            {/* Total Saved Card */}
            <View style={styles.totalCard}>
              <View style={styles.totalTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.totalLabel}>Total Saved</Text>
                  <Text style={styles.totalAmount}>${total.toFixed(2)}</Text>
                  <Text style={styles.totalCaption}>
                    {savings.length} {savings.length === 1 ? 'smart choice' : 'smart choices'} made
                  </Text>
                </View>
                <View style={styles.totalIcon}>
                  <MaterialCommunityIcons name="trophy-outline" size={32} color={GOLD} />
                </View>
              </View>

              {/* Reset button */}
              {savings.length > 0 && (
                <TouchableOpacity style={styles.resetBtn} onPress={handleReset} activeOpacity={0.7}>
                  <MaterialCommunityIcons name="restart" size={16} color={Colors.danger} />
                  <Text style={styles.resetText}>Reset & Spend It</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Section header */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>History</Text>
              <Text style={styles.sectionCount}>{savings.length}</Text>
            </View>

            {savings.length === 0 && (
              <View style={styles.emptyState}>
                <MaterialCommunityIcons name="cash-check" size={56} color={Colors.outline} />
                <Text style={styles.emptyText}>No savings yet</Text>
                <Text style={styles.emptySubText}>
                  Skipped a cab? Avoided takeout?{'\n'}Tap + to log the money you saved
                </Text>
              </View>
            )}
          </>
        }
        renderItem={({ item }) => (
          <SavingRow item={item} onDelete={() => deleteSaving(item.id)} />
        )}
      />

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => sheetRef.current?.expand()}
        activeOpacity={0.85}>
        <MaterialCommunityIcons name="plus" size={28} color={ON_GOLD} />
      </TouchableOpacity>

      <AddSavingSheet sheetRef={sheetRef} />
    </SafeAreaView>
  );
}

function SavingRow({ item, onDelete }: { item: Saving; onDelete: () => void }) {
  const displayDate = new Date(item.date + 'T00:00:00').toLocaleDateString('default', {
    month: 'short',
    day: 'numeric',
  });

  return (
    <View style={styles.savingCard}>
      <View style={styles.savingIconWrap}>
        <MaterialCommunityIcons name="leaf" size={22} color={GOLD} />
      </View>

      <View style={styles.savingBody}>
        <Text style={styles.savingName} numberOfLines={1}>{item.name}</Text>
        {item.note ? (
          <Text style={styles.savingNote} numberOfLines={1}>{item.note}</Text>
        ) : null}
        <Text style={styles.savingDate}>{displayDate}</Text>
      </View>

      <View style={styles.savingRight}>
        <Text style={styles.savingAmount}>+${item.amount.toFixed(2)}</Text>
        <Pressable onPress={onDelete} hitSlop={10} style={styles.deleteBtn}>
          <MaterialCommunityIcons name="trash-can-outline" size={16} color={Colors.outline} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  listContent: { paddingHorizontal: 18, paddingBottom: 100 },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 16,
    paddingBottom: 14,
  },
  title: { color: Colors.text, fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  subtitle: { color: Colors.textSecondary, fontSize: 13, marginTop: 2 },
  headerIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: GOLD_MUTED,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },

  totalCard: {
    backgroundColor: Colors.surface,
    borderRadius: 24,
    padding: 22,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  totalTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  totalLabel: { color: Colors.textSecondary, fontSize: 13, fontWeight: '600', marginBottom: 4 },
  totalAmount: { color: GOLD, fontSize: 44, fontWeight: '800', letterSpacing: -1 },
  totalCaption: { color: Colors.textMuted, fontSize: 12, marginTop: 2 },
  totalIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: GOLD_MUTED,
    alignItems: 'center',
    justifyContent: 'center',
  },

  resetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    marginTop: 18,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.danger + '44',
    backgroundColor: Colors.danger + '12',
  },
  resetText: { color: Colors.danger, fontSize: 13, fontWeight: '600' },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  sectionTitle: { color: Colors.text, fontSize: 17, fontWeight: '700' },
  sectionCount: {
    backgroundColor: Colors.surfaceContainer,
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },

  emptyState: { alignItems: 'center', paddingTop: 48, gap: 10 },
  emptyText: { color: Colors.text, fontSize: 18, fontWeight: '700' },
  emptySubText: { color: Colors.textSecondary, fontSize: 14, textAlign: 'center', lineHeight: 20 },

  savingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 18,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 12,
  },
  savingIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: GOLD_MUTED,
    alignItems: 'center',
    justifyContent: 'center',
  },
  savingBody: { flex: 1, gap: 3 },
  savingName: { color: Colors.text, fontSize: 15, fontWeight: '700' },
  savingNote: { color: Colors.textSecondary, fontSize: 12 },
  savingDate: { color: Colors.textMuted, fontSize: 11 },
  savingRight: { alignItems: 'flex-end', gap: 8 },
  savingAmount: { color: GOLD, fontSize: 15, fontWeight: '700' },
  deleteBtn: { padding: 2 },

  fab: {
    position: 'absolute',
    bottom: 24,
    right: 22,
    width: 58,
    height: 58,
    borderRadius: 18,
    backgroundColor: GOLD,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: GOLD,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
});
