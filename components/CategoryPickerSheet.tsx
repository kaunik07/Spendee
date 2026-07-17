import { MaterialCommunityIcons } from '@expo/vector-icons';
import BottomSheet, { BottomSheetBackdrop, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import React, { useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Categories } from '@/constants/theme';

type Category = typeof Categories[number];

const C = {
  bg: '#1C1B23',
  surface: '#252336',
  text: '#E6E1E5',
  textSec: '#CAC4D0',
  outline: '#938F99',
  border: '#2E2C3B',
};

interface Props {
  sheetRef: React.RefObject<BottomSheet | null>;
  selected: string;
  onSelect: (id: string) => void;
  categories?: Category[];
}

export default function CategoryPickerSheet({ sheetRef, selected, onSelect, categories = Categories }: Props) {
  const snapPoints = useMemo(() => ['65%'], []);

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
      <BottomSheetScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Select Category</Text>
        <View style={styles.grid}>
          {categories.map((cat) => {
            const isSelected = selected === cat.id;
            return (
              <Pressable
                key={cat.id}
                style={[styles.cell, isSelected && { backgroundColor: cat.color + '22', borderColor: cat.color }]}
                onPress={() => {
                  onSelect(cat.id);
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
  container: { paddingHorizontal: 20, paddingBottom: 40 },
  title: { color: C.text, fontSize: 18, fontWeight: '700', marginBottom: 16, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  cell: {
    width: '31%',
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
