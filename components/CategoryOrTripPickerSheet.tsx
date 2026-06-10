import { MaterialCommunityIcons } from '@expo/vector-icons';
import BottomSheet, { BottomSheetBackdrop, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import React, { useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Categories } from '@/constants/theme';
import { useTripsContext } from '@/store/TripsContext';

const C = {
  bg:      '#1C1B23',
  surface: '#252336',
  text:    '#E6E1E5',
  textSec: '#CAC4D0',
  outline: '#938F99',
  border:  '#2E2C3B',
  trip:    '#FFB74D',
};

interface Props {
  sheetRef: React.RefObject<BottomSheet | null>;
  selectedCategory: string;
  selectedTripId?: string;
  onSelectCategory: (id: string) => void;
  onSelectTrip: (id: string, name: string) => void;
}

export default function CategoryOrTripPickerSheet({
  sheetRef,
  selectedCategory,
  selectedTripId,
  onSelectCategory,
  onSelectTrip,
}: Props) {
  const { trips } = useTripsContext();
  const snapPoints = useMemo(() => ['75%'], []);

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.5} />
    ),
    []
  );

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={snapPoints}
      enablePanDownToClose
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor: C.bg }}
      handleIndicatorStyle={{ backgroundColor: C.outline }}>
      <BottomSheetScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}>

        <Text style={styles.title}>Select Category</Text>

        {/* Trips Section */}
        {trips.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>TRIPS</Text>
            <View style={styles.tripList}>
              {trips.map((trip) => {
                const isSelected = selectedTripId === trip.id;
                return (
                  <Pressable
                    key={trip.id}
                    style={[styles.tripCell, isSelected && { backgroundColor: C.trip + '22', borderColor: C.trip }]}
                    onPress={() => {
                      onSelectTrip(trip.id, trip.name);
                      sheetRef.current?.close();
                    }}
                    android_ripple={{ color: C.trip + '33' }}>
                    <View style={styles.tripIcon}>
                      <MaterialCommunityIcons name="bag-suitcase-outline" size={20} color={C.trip} />
                    </View>
                    <Text style={[styles.tripLabel, isSelected && { color: C.trip }]} numberOfLines={1}>
                      {trip.name}
                    </Text>
                    {isSelected && (
                      <MaterialCommunityIcons name="check-circle" size={16} color={C.trip} />
                    )}
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.sectionLabel}>CATEGORIES</Text>
          </>
        )}

        {/* Categories Grid */}
        <View style={styles.grid}>
          {Categories.map((cat) => {
            const isSelected = !selectedTripId && selectedCategory === cat.id;
            return (
              <Pressable
                key={cat.id}
                style={[styles.cell, isSelected && { backgroundColor: cat.color + '22', borderColor: cat.color }]}
                onPress={() => {
                  onSelectCategory(cat.id);
                  sheetRef.current?.close();
                }}
                android_ripple={{ color: cat.color + '33' }}>
                <View style={[styles.iconCircle, { backgroundColor: cat.color + '22' }]}>
                  <MaterialCommunityIcons name={cat.icon as any} size={24} color={cat.color} />
                </View>
                <Text style={[styles.cellLabel, isSelected && { color: cat.color }]}>{cat.label}</Text>
                {isSelected && (
                  <MaterialCommunityIcons name="check-circle" size={16} color={cat.color} style={styles.check} />
                )}
              </Pressable>
            );
          })}
        </View>
      </BottomSheetScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 20, paddingBottom: 28 },

  title: {
    color: C.text,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
    textAlign: 'center',
  },

  sectionLabel: {
    color: C.outline,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 10,
  },

  tripList: { gap: 8, marginBottom: 20 },
  tripCell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: C.surface,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1.5,
    borderColor: C.border,
  },
  tripIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: C.trip + '22',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tripLabel: { flex: 1, color: C.textSec, fontSize: 14, fontWeight: '600' },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  cell: {
    width: '30%',
    flexGrow: 1,
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 8,
    backgroundColor: C.surface,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: C.border,
    gap: 8,
    position: 'relative',
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellLabel: { color: C.textSec, fontSize: 11, fontWeight: '600', textAlign: 'center' },
  check: { position: 'absolute', top: 8, right: 8 },
});
