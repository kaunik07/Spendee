import { MaterialCommunityIcons } from '@expo/vector-icons';
import BottomSheet from '@gorhom/bottom-sheet';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Circle, G, Path, Svg } from 'react-native-svg';
import AddTripExpenseSheet from '@/components/AddTripExpenseSheet';
import EditTripSheet from '@/components/EditTripSheet';
import { Colors, getTripCategoryById } from '@/constants/theme';
import { getCurrencyByCode } from '@/constants/currencies';
import { useExpenseContext } from '@/store/ExpenseContext';
import { useExpenseActions } from '@/store/useExpenseActions';
import { useTripsContext } from '@/store/TripsContext';
import { Expense } from '@/store/useExpenses';

export default function TripDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const sheetRef     = useRef<BottomSheet>(null);
  const editSheetRef = useRef<BottomSheet>(null);

  const { getTripById, refresh: refreshTrips }       = useTripsContext();
  const { expenses, refresh: refreshExpenses }       = useExpenseContext();
  const { deleteExpenseWithReversal }                = useExpenseActions();

  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = () => {
    setRefreshing(true);
    refreshTrips();
    refreshExpenses();
    setTimeout(() => setRefreshing(false), 800);
  };

  const trip           = getTripById(id);
  const tripExpenses   = expenses.filter((e) => e.tripId === id);
  const tripTotal      = tripExpenses.reduce((s, e) => s + e.amount, 0);
  const currencySymbol = getCurrencyByCode(trip?.currency ?? 'USD').symbol;

  if (!trip) return null;

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{trip.name}</Text>
        <TouchableOpacity onPress={() => editSheetRef.current?.expand()} hitSlop={10} style={styles.editActionBtn}>
          <MaterialCommunityIcons name="pencil-outline" size={20} color={Colors.outline} />
        </TouchableOpacity>
      </View>

      {/* Summary Card */}
      <View style={styles.summaryCard}>
        <View style={styles.summaryTop}>
          <View style={styles.summaryIcon}>
            <MaterialCommunityIcons name="bag-suitcase-outline" size={28} color={Colors.trip} />
          </View>
          <View>
            <Text style={styles.summaryLabel}>Total Spent</Text>
            <Text style={styles.summaryAmount}>{currencySymbol}{tripTotal.toFixed(2)}</Text>
            <Text style={styles.summaryCount}>
              {tripExpenses.length} expense{tripExpenses.length !== 1 ? 's' : ''}
            </Text>
          </View>
        </View>
        <CategoryDonut expenses={tripExpenses} currencySymbol={currencySymbol} />
      </View>

      {/* Expense List */}
      <FlatList
        data={tripExpenses}
        keyExtractor={(e) => e.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Colors.trip} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <MaterialCommunityIcons name="receipt-text-outline" size={48} color={Colors.outline} />
            <Text style={styles.emptyText}>No expenses yet</Text>
            <Text style={styles.emptySub}>Tap + to add your first expense</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TripExpenseRow item={item} onDelete={() => deleteExpenseWithReversal(item)} currencySymbol={currencySymbol} />
        )}
      />

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => sheetRef.current?.expand()}
        activeOpacity={0.85}>
        <MaterialCommunityIcons name="plus" size={28} color={Colors.onTrip} />
      </TouchableOpacity>

      <AddTripExpenseSheet sheetRef={sheetRef} tripId={id} tripName={trip.name} />
      <EditTripSheet sheetRef={editSheetRef} trip={trip} onDeleted={() => router.back()} />
    </SafeAreaView>
  );
}

function CategoryDonut({ expenses, currencySymbol }: { expenses: Expense[]; currencySymbol: string }) {
  if (expenses.length === 0) return null;

  const totals: Record<string, { amount: number; color: string; label: string }> = {};
  expenses.forEach((e) => {
    const cat = getTripCategoryById(e.category);
    if (!totals[cat.id]) totals[cat.id] = { amount: 0, color: cat.color, label: cat.label };
    totals[cat.id].amount += e.amount;
  });

  const total = expenses.reduce((s, e) => s + e.amount, 0);
  const slices = Object.values(totals).sort((a, b) => b.amount - a.amount);

  const SIZE = 160;
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const R = 60;
  const r = 40;

  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const polarToCart = (angle: number, radius: number) => ({
    x: cx + radius * Math.cos(toRad(angle - 90)),
    y: cy + radius * Math.sin(toRad(angle - 90)),
  });

  // Single category — SVG arc paths can't draw a full 360°, use circles instead
  if (slices.length === 1) {
    return (
      <View style={donutStyles.wrap}>
        <View style={donutStyles.chartWrap}>
          <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
            <Circle cx={cx} cy={cy} r={R} fill={slices[0].color} />
            <Circle cx={cx} cy={cy} r={r} fill={Colors.surface} />
          </Svg>
        </View>
        <View style={donutStyles.legend}>
          {slices.map((slice) => (
            <View key={slice.label} style={donutStyles.legendItem}>
              <View style={[donutStyles.dot, { backgroundColor: slice.color }]} />
              <View style={donutStyles.legendText}>
                <Text style={donutStyles.legendLabel} numberOfLines={1}>{slice.label}</Text>
                <Text style={[donutStyles.legendAmt, { color: slice.color }]}>{currencySymbol}{slice.amount.toFixed(0)}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>
    );
  }

  let startAngle = 0;
  const paths: { d: string; color: string }[] = [];

  slices.forEach((slice) => {
    const sweep = (slice.amount / total) * 360;
    const endAngle = startAngle + sweep;
    const large = sweep > 180 ? 1 : 0;
    const o1 = polarToCart(startAngle, R);
    const o2 = polarToCart(endAngle, R);
    const i1 = polarToCart(endAngle, r);
    const i2 = polarToCart(startAngle, r);
    paths.push({
      color: slice.color,
      d: `M ${o1.x} ${o1.y} A ${R} ${R} 0 ${large} 1 ${o2.x} ${o2.y} L ${i1.x} ${i1.y} A ${r} ${r} 0 ${large} 0 ${i2.x} ${i2.y} Z`,
    });
    startAngle = endAngle;
  });

  return (
    <View style={donutStyles.wrap}>
      {/* Donut centered */}
      <View style={donutStyles.chartWrap}>
        <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
          <G>
            {paths.map((p, i) => <Path key={i} d={p.d} fill={p.color} />)}
          </G>
        </Svg>
      </View>

      {/* Legend grid below donut */}
      <View style={donutStyles.legend}>
        {slices.map((slice) => (
          <View key={slice.label} style={donutStyles.legendItem}>
            <View style={[donutStyles.dot, { backgroundColor: slice.color }]} />
            <View style={donutStyles.legendText}>
              <Text style={donutStyles.legendLabel} numberOfLines={1}>{slice.label}</Text>
              <Text style={[donutStyles.legendAmt, { color: slice.color }]}>{currencySymbol}{slice.amount.toFixed(0)}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const donutStyles = StyleSheet.create({
  wrap: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.trip + '30',
    alignItems: 'center',
    gap: 14,
  },
  chartWrap: { alignItems: 'center', justifyContent: 'center' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center', width: '100%' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6, width: '44%' },
  dot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  legendText: { flex: 1 },
  legendLabel: { color: Colors.textSecondary, fontSize: 11 },
  legendAmt: { fontSize: 12, fontWeight: '700', marginTop: 1 },
});

function TripExpenseRow({ item, onDelete, currencySymbol }: { item: Expense; onDelete: () => void; currencySymbol: string }) {
  const router = useRouter();
  const cat = getTripCategoryById(item.category);
  const displayDate = new Date(item.date + 'T00:00:00').toLocaleDateString('default', {
    month: 'short', day: 'numeric',
  });

  return (
    <TouchableOpacity style={styles.expenseCard} onPress={() => router.push(`/edit-expense/${item.id}`)} activeOpacity={0.75}>
      <View style={[styles.expenseIconWrap, { backgroundColor: cat.color + '20' }]}>
        <MaterialCommunityIcons name={cat.icon as any} size={22} color={cat.color} />
      </View>

      <View style={styles.expenseBody}>
        <Text style={styles.expenseName} numberOfLines={1}>{item.name}</Text>
        <View style={styles.expenseMeta}>
          <Text style={[styles.expenseCat, { color: cat.color }]}>{cat.label}</Text>
          {item.note ? <Text style={styles.expenseNote} numberOfLines={1}>· {item.note}</Text> : null}
        </View>
        <Text style={styles.expenseDate}>{displayDate}</Text>
      </View>

      <View style={styles.expenseRight}>
        <Text style={styles.expenseAmount}>-{currencySymbol}{item.amount.toFixed(2)}</Text>
        <Pressable onPress={onDelete} hitSlop={10}>
          <MaterialCommunityIcons name="trash-can-outline" size={16} color={Colors.outline} />
        </Pressable>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 12,
    gap: 12,
  },
  backBtn: { padding: 2 },
  headerTitle: {
    flex: 1,
    color: Colors.text,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  editActionBtn: { padding: 2, marginLeft: 4 },

  summaryCard: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 20,
    marginHorizontal: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.trip + '50',
  },
  summaryTop: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  summaryIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: Colors.trip + '22',
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryLabel: { color: Colors.textSecondary, fontSize: 12, fontWeight: '600', marginBottom: 2 },
  summaryAmount: { color: Colors.trip, fontSize: 30, fontWeight: '800', letterSpacing: -0.5 },
  summaryCount: { color: Colors.textMuted, fontSize: 12, marginTop: 2 },

  list: { paddingHorizontal: 18, paddingBottom: 110 },

  empty: { alignItems: 'center', paddingTop: 48, gap: 10 },
  emptyText: { color: Colors.text, fontSize: 17, fontWeight: '700' },
  emptySub: { color: Colors.textSecondary, fontSize: 14 },

  expenseCard: {
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
  expenseIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  expenseBody: { flex: 1, gap: 3 },
  expenseName: { color: Colors.text, fontSize: 15, fontWeight: '700' },
  expenseMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  expenseCat: { fontSize: 12, fontWeight: '600' },
  expenseNote: { color: Colors.textSecondary, fontSize: 12, flex: 1 },
  expenseDate: { color: Colors.textMuted, fontSize: 11 },
  expenseRight: { alignItems: 'flex-end', gap: 8 },
  expenseAmount: { color: Colors.danger, fontSize: 15, fontWeight: '700' },

  fab: {
    position: 'absolute',
    bottom: 32,
    right: 22,
    width: 58,
    height: 58,
    borderRadius: 18,
    backgroundColor: Colors.trip,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.trip,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
});
