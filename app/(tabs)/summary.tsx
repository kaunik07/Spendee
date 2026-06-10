import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Calendar } from 'react-native-calendars';
import { Colors, getCategoryById } from '@/constants/theme';
import { useExpenseContext } from '@/store/ExpenseContext';
import { useTripsContext } from '@/store/TripsContext';
import { Expense } from '@/store/useExpenses';

const H_PAD = 18;
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function todayStr() { return new Date().toISOString().split('T')[0]; }

type Granularity = 'day' | 'month';

export default function SummaryScreen() {
  const [granularity, setGranularity] = useState<Granularity>('day');

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>Summary</Text>
        <View style={styles.toggle}>
          {(['day', 'month'] as Granularity[]).map((g) => {
            const active = granularity === g;
            return (
              <TouchableOpacity
                key={g}
                style={[styles.toggleBtn, active && styles.toggleActive]}
                onPress={() => setGranularity(g)}>
                <MaterialCommunityIcons
                  name={g === 'day' ? 'calendar-today' : 'calendar-month'}
                  size={14}
                  color={active ? Colors.onPrimary : Colors.outline}
                />
                <Text style={[styles.toggleText, active && styles.toggleTextActive]}>
                  {g === 'day' ? 'Day' : 'Month'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={{ flex: 1 }}>
        <CalendarTab granularity={granularity} />
      </View>
    </SafeAreaView>
  );
}

function CalendarTab({ granularity }: { granularity: Granularity }) {
  const { expensesByDate, expensesForDate, monthlyTotals, refresh } = useExpenseContext();
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [currentYear]  = useState(new Date().getFullYear());
  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = () => {
    setRefreshing(true);
    refresh();
    setTimeout(() => setRefreshing(false), 800);
  };

  const byDate  = expensesByDate();
  const monthly = monthlyTotals(currentYear);

  const markedDates: Record<string, any> = {};
  Object.entries(byDate).forEach(([date]) => {
    markedDates[date] = { marked: true, dotColor: Colors.primary };
  });
  if (selectedDate) {
    markedDates[selectedDate] = {
      ...(markedDates[selectedDate] ?? {}),
      selected: true,
      selectedColor: Colors.primary,
      selectedTextColor: Colors.onPrimary,
    };
  }

  const selectedExpenses = expensesForDate(selectedDate);
  const selectedTotal    = selectedExpenses.reduce((s, e) => s + e.amount, 0);

  if (granularity === 'day') {
    return (
      <>
        <Calendar
          onDayPress={(day: { dateString: string }) => setSelectedDate(day.dateString)}
          markedDates={markedDates}
          theme={{
            backgroundColor: Colors.background,
            calendarBackground: Colors.surface,
            textSectionTitleColor: Colors.textSecondary,
            selectedDayBackgroundColor: Colors.primary,
            selectedDayTextColor: Colors.onPrimary,
            todayTextColor: Colors.primary,
            dayTextColor: Colors.text,
            textDisabledColor: Colors.textMuted,
            dotColor: Colors.primary,
            selectedDotColor: Colors.onPrimary,
            arrowColor: Colors.primary,
            monthTextColor: Colors.text,
            textDayFontWeight: '500',
            textMonthFontWeight: '700',
            textDayHeaderFontWeight: '600',
          }}
          style={styles.calendar}
        />
        <View style={styles.daySection}>
          <View style={styles.daySectionHeader}>
            <View>
              <Text style={styles.daySectionDate}>
                {new Date(selectedDate + 'T00:00:00').toLocaleDateString('default', {
                  weekday: 'long', month: 'long', day: 'numeric',
                })}
              </Text>
              <Text style={styles.daySectionCount}>
                {selectedExpenses.length} expense{selectedExpenses.length !== 1 ? 's' : ''}
              </Text>
            </View>
            {selectedTotal > 0 && (
              <View style={styles.dayTotalBadge}>
                <Text style={styles.dayTotalText}>-${selectedTotal.toFixed(2)}</Text>
              </View>
            )}
          </View>
          {selectedExpenses.length === 0 ? (
            <View style={styles.noExpenses}>
              <MaterialCommunityIcons name="calendar-blank-outline" size={40} color={Colors.outline} />
              <Text style={styles.noExpensesText}>No expenses on this day</Text>
            </View>
          ) : (
            <FlatList
              data={selectedExpenses}
              keyExtractor={(item) => item.id}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 20 }}
              renderItem={({ item }) => <DayExpenseRow item={item} />}
            />
          )}
        </View>
      </>
    );
  }

  return (
    <FlatList
      data={MONTH_NAMES}
      keyExtractor={(m) => m}
      contentContainerStyle={styles.monthList}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Colors.primary} />}
      renderItem={({ item: monthName, index }) => {
        const key = `${currentYear}-${String(index + 1).padStart(2, '0')}`;
        const total = monthly[key] ?? 0;
        const isCurrentMonth = new Date().getMonth() === index;
        const isPast = index < new Date().getMonth();
        return (
          <View style={[styles.monthCard, isCurrentMonth && styles.monthCardCurrent]}>
            <View style={styles.monthCardLeft}>
              <Text style={[
                styles.monthCardName,
                isCurrentMonth && { color: Colors.primary },
                !isPast && !isCurrentMonth && { color: Colors.textMuted },
              ]}>
                {monthName}
              </Text>
              <Text style={styles.monthCardYear}>{currentYear}</Text>
              {isCurrentMonth && (
                <View style={styles.currentChip}>
                  <Text style={styles.currentChipText}>Current</Text>
                </View>
              )}
            </View>
            <View style={styles.monthCardRight}>
              {total > 0
                ? <><Text style={styles.monthCardTotal}>${total.toFixed(2)}</Text>
                    <MaterialCommunityIcons name="chevron-right" size={16} color={Colors.outline} /></>
                : <Text style={styles.monthCardEmpty}>—</Text>
              }
            </View>
          </View>
        );
      }}
    />
  );
}

function DayExpenseRow({ item }: { item: Expense }) {
  const { getTripById } = useTripsContext();
  const cat = getCategoryById(item.category);
  const trip = item.tripId ? getTripById(item.tripId) : null;
  const displayIcon  = trip ? 'bag-suitcase' : cat.icon;
  const displayColor = trip ? Colors.trip : cat.color;
  const displayLabel = trip ? trip.name : cat.label;
  return (
    <View style={styles.expenseCard}>
      <View style={[styles.expenseIconWrap, { backgroundColor: displayColor + '20' }]}>
        <MaterialCommunityIcons name={displayIcon as any} size={20} color={displayColor} />
      </View>
      <View style={styles.expenseBody}>
        <Text style={styles.expenseName} numberOfLines={1}>{item.name}</Text>
        <Text style={[styles.expenseCat, { color: displayColor }]}>{displayLabel}</Text>
        {item.note ? <Text style={styles.expenseNote} numberOfLines={1}>{item.note}</Text> : null}
      </View>
      <Text style={styles.expenseAmount}>-${item.amount.toFixed(2)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: H_PAD,
    paddingTop: 16,
    paddingBottom: 10,
  },
  title: { color: Colors.text, fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },

  toggle: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 4,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 4,
  },
  toggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 10,
  },
  toggleActive: { backgroundColor: Colors.primary },
  toggleText: { color: Colors.outline, fontSize: 13, fontWeight: '600' },
  toggleTextActive: { color: Colors.onPrimary },

  calendar: {
    marginHorizontal: H_PAD,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  daySection: { flex: 1, paddingHorizontal: H_PAD, paddingTop: 16 },
  daySectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  daySectionDate: { color: Colors.text, fontSize: 15, fontWeight: '700' },
  daySectionCount: { color: Colors.textSecondary, fontSize: 12, marginTop: 2 },
  dayTotalBadge: {
    backgroundColor: Colors.surfaceContainer,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  dayTotalText: { color: Colors.danger, fontSize: 15, fontWeight: '700' },
  noExpenses: { alignItems: 'center', paddingTop: 32, gap: 10 },
  noExpensesText: { color: Colors.textMuted, fontSize: 14 },

  expenseCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 12,
  },
  expenseIconWrap: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  expenseBody: { flex: 1, gap: 2 },
  expenseName: { color: Colors.text, fontSize: 15, fontWeight: '700' },
  expenseCat: { fontSize: 12, fontWeight: '600' },
  expenseNote: { color: Colors.textSecondary, fontSize: 12 },
  expenseAmount: { color: Colors.danger, fontSize: 15, fontWeight: '700' },

  monthList: { paddingHorizontal: H_PAD, paddingTop: 8, paddingBottom: 40 },
  monthCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  monthCardCurrent: { borderColor: Colors.primary + '60', backgroundColor: Colors.surfaceContainer },
  monthCardLeft: { gap: 3 },
  monthCardName: { color: Colors.text, fontSize: 17, fontWeight: '700' },
  monthCardYear: { color: Colors.textMuted, fontSize: 12 },
  currentChip: {
    backgroundColor: Colors.primaryMuted,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  currentChipText: { color: Colors.primary, fontSize: 10, fontWeight: '700' },
  monthCardRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  monthCardTotal: { color: Colors.danger, fontSize: 17, fontWeight: '700' },
  monthCardEmpty: { color: Colors.textMuted, fontSize: 18, fontWeight: '300' },
});
