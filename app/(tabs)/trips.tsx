import { MaterialCommunityIcons } from '@expo/vector-icons';
import BottomSheet from '@gorhom/bottom-sheet';
import { useRouter } from 'expo-router';
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
import AddTripSheet from '@/components/AddTripSheet';
import { Colors } from '@/constants/theme';
import { useExpenseContext } from '@/store/ExpenseContext';
import { useTripsContext } from '@/store/TripsContext';
import { Trip } from '@/store/useTrips';

export default function TripsScreen() {
  const router = useRouter();
  const sheetRef = useRef<BottomSheet>(null);
  const { trips, refresh: refreshTrips }       = useTripsContext();
  const { expenses, refresh: refreshExpenses } = useExpenseContext();

  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = async () => {
    setRefreshing(true);
    refreshTrips();
    refreshExpenses();
    setTimeout(() => setRefreshing(false), 800);
  };

  const getTripStats = (tripId: string) => {
    const tripExpenses = expenses.filter((e) => e.tripId === tripId);
    return {
      total: tripExpenses.reduce((s, e) => s + e.amount, 0),
      count: tripExpenses.length,
    };
  };

  return (
    <SafeAreaView style={styles.safe}>
      <FlatList
        data={trips}
        keyExtractor={(t) => t.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Colors.trip} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>Trips</Text>
            <Text style={styles.subtitle}>Track your travel spending</Text>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <MaterialCommunityIcons name="compass-outline" size={56} color={Colors.outline} />
            <Text style={styles.emptyText}>No trips yet</Text>
            <Text style={styles.emptySub}>Tap + to create your first trip</Text>
          </View>
        }
        renderItem={({ item }) => {
          const stats = getTripStats(item.id);
          return (
            <TripCard
              trip={item}
              total={stats.total}
              count={stats.count}
              onPress={() => router.push(`/trip/${item.id}` as any)}
            />
          );
        }}
      />

      <TouchableOpacity
        style={styles.fab}
        onPress={() => sheetRef.current?.expand()}
        activeOpacity={0.85}>
        <MaterialCommunityIcons name="plus" size={28} color={Colors.onTrip} />
      </TouchableOpacity>

      <AddTripSheet sheetRef={sheetRef} />
    </SafeAreaView>
  );
}

function TripCard({
  trip,
  total,
  count,
  onPress,
}: {
  trip: Trip;
  total: number;
  count: number;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={styles.card}
      onPress={onPress}
      android_ripple={{ color: Colors.trip + '30' }}>
      <View style={styles.cardLeft}>
        <View style={styles.cardIcon}>
          <MaterialCommunityIcons name="bag-suitcase-outline" size={24} color={Colors.trip} />
        </View>
        <View style={styles.cardBody}>
          <Text style={styles.cardName}>{trip.name}</Text>
          <Text style={styles.cardCount}>
            {count} expense{count !== 1 ? 's' : ''}
          </Text>
        </View>
      </View>
      <View style={styles.cardRight}>
        <Text style={[styles.cardTotal, count === 0 && styles.cardTotalEmpty]}>
          {count === 0 ? '—' : `-$${total.toFixed(2)}`}
        </Text>
        <MaterialCommunityIcons name="chevron-right" size={18} color={Colors.outline} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  list: { paddingHorizontal: 18, paddingBottom: 110 },

  header: { paddingTop: 16, paddingBottom: 20 },
  title: { color: Colors.text, fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  subtitle: { color: Colors.textSecondary, fontSize: 13, marginTop: 2 },

  empty: { alignItems: 'center', paddingTop: 64, gap: 10 },
  emptyText: { color: Colors.text, fontSize: 18, fontWeight: '700' },
  emptySub: { color: Colors.textSecondary, fontSize: 14 },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 18,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: Colors.trip + '22',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: { gap: 3 },
  cardName: { color: Colors.text, fontSize: 16, fontWeight: '700' },
  cardCount: { color: Colors.textSecondary, fontSize: 13 },
  cardRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cardTotal: { color: Colors.danger, fontSize: 16, fontWeight: '700' },
  cardTotalEmpty: { color: Colors.textMuted, fontWeight: '300', fontSize: 18 },

  fab: {
    position: 'absolute',
    bottom: 82,
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
