// Statement import — the category pill's picker. Anchored to the pill it
// opens from (measureInWindow, the same pattern app/(tabs)/expenses.web.tsx's
// date popover already uses) rather than a WebDrawer — a review table can
// have 200 rows, and a 420px drawer per click is the wrong weight for a
// single pick.
//
// One tree, not two steps: every category lists its own subcategories
// (constants/subcategories.ts) inline, so picking "Transport" then "Cab" is
// one popover, not a category screen followed by a subcategory screen.
// Categories with no subcategory list (Trip, Bills, Health, Transfer, Other)
// just show as a single row with nothing to expand.
import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Categories, Colors } from '@/constants/theme';
import { getSubcategories } from '@/constants/subcategories';

interface Props {
  visible: boolean;
  position: { top: number; left: number };
  currentCategory: string;
  currentSubcategory: string | null;
  onSelect: (category: string, subcategory: string | null) => void;
  onClose: () => void;
}

export default function CategoryPopover({ visible, position, currentCategory, currentSubcategory, onSelect, onClose }: Props) {
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.popover, { top: position.top, left: position.left }]} onPress={() => {}}>
          <ScrollView style={styles.scroll}>
            {Categories.map((cat) => {
              const subs = getSubcategories(cat.id);
              const isCurrentCat = cat.id === currentCategory;
              return (
                <View key={cat.id}>
                  <Pressable
                    style={[styles.catRow, isCurrentCat && !currentSubcategory && styles.rowSelected]}
                    onPress={() => { onSelect(cat.id, null); onClose(); }}>
                    <MaterialCommunityIcons name={cat.icon as any} size={15} color={cat.color} />
                    <Text style={[styles.catText, { color: cat.color }]}>{cat.label}</Text>
                  </Pressable>
                  {subs.length > 0 && (
                    <View style={styles.subRow}>
                      {subs.map((sub) => {
                        const isSelected = isCurrentCat && currentSubcategory === sub.id;
                        return (
                          <Pressable
                            key={sub.id}
                            style={[styles.subChip, isSelected && { backgroundColor: cat.color + '2A', borderColor: cat.color + '80' }]}
                            onPress={() => { onSelect(cat.id, sub.id); onClose(); }}>
                            <MaterialCommunityIcons name={sub.icon as any} size={12} color={isSelected ? cat.color : Colors.outline} />
                            <Text style={[styles.subChipText, isSelected && { color: cat.color }]}>{sub.label}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  )}
                </View>
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1 },
  popover: {
    position: 'absolute', width: 300, maxHeight: 420,
    backgroundColor: Colors.surfaceContainerHigh,
    borderRadius: 14, borderWidth: 1, borderColor: Colors.border,
    paddingVertical: 6,
    boxShadow: '0 12px 28px rgba(0,0,0,0.45)',
  } as any,
  scroll: { paddingHorizontal: 6 },
  catRow: {
    flexDirection: 'row', alignItems: 'center', gap: 9,
    paddingVertical: 8, paddingHorizontal: 10, borderRadius: 9,
  },
  rowSelected: { backgroundColor: Colors.surfaceContainer },
  catText: { fontSize: 13, fontWeight: '700' },
  subRow: { flexDirection: 'row', flexWrap: 'wrap' as any, gap: 6, paddingLeft: 30, paddingBottom: 8, paddingRight: 8 },
  subChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingVertical: 4, paddingHorizontal: 9,
    borderRadius: 999, borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.surfaceContainer,
  },
  subChipText: { fontSize: 11, fontWeight: '600', color: Colors.textSecondary },
});
