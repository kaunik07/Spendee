// Web override of the Savings tab. Same data/hooks as savings.tsx (mobile).
import { MaterialCommunityIcons } from '@expo/vector-icons';
import BottomSheet from '@gorhom/bottom-sheet';
import React, { useRef } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import AddSavingSheet from '@/components/AddSavingSheet';
import WebPanel from '@/components/web/WebPanel';
import WebStatCard from '@/components/web/WebStatCard';
import { Colors } from '@/constants/theme';
import { useSavingsContext } from '@/store/SavingsContext';
import { Saving } from '@/store/useSavings';

const GOLD = '#FFD666';

export default function SavingsScreenWeb() {
  const sheetRef = useRef<BottomSheet>(null);
  const { savings, totalSaved, resetSavings, deleteSaving } = useSavingsContext();
  const total = totalSaved();

  const handleReset = () => {
    if (typeof window !== 'undefined' && !window.confirm('Reset all savings? This clears every entry and cannot be undone.')) return;
    resetSavings();
  };

  return (
    <View>
      <View style={styles.topbar}>
        <View>
          <Text style={styles.title}>Savings Jar</Text>
          <Text style={styles.sub}>Money you chose not to spend</Text>
        </View>
        <Pressable style={styles.addBtn} onPress={() => sheetRef.current?.expand()}>
          <MaterialCommunityIcons name="plus" size={16} color="#3A2E00" />
          <Text style={styles.addBtnText}>Add Saving</Text>
        </Pressable>
      </View>

      <View style={styles.statRow}>
        <WebStatCard label="Total Saved" value={`$${total.toFixed(2)}`} valueColor={GOLD} note={`${savings.length} smart choice${savings.length !== 1 ? 's' : ''}`} />
        {savings.length > 0 && (
          <Pressable style={styles.resetCard} onPress={handleReset}>
            <MaterialCommunityIcons name="restart" size={16} color={Colors.danger} />
            <Text style={styles.resetText}>Reset & Spend It</Text>
          </Pressable>
        )}
      </View>

      <WebPanel title="History" linkLabel={`${savings.length} entries`}>
        {savings.length === 0 ? (
          <Text style={styles.emptyText}>Skipped a cab? Avoided takeout? Add the money you saved above.</Text>
        ) : (
          savings.map((item) => <SavingRow key={item.id} item={item} onDelete={() => deleteSaving(item.id)} />)
        )}
      </WebPanel>

      <AddSavingSheet sheetRef={sheetRef} />
    </View>
  );
}

function SavingRow({ item, onDelete }: { item: Saving; onDelete: () => void }) {
  const displayDate = new Date(item.date + 'T00:00:00').toLocaleDateString('default', { month: 'short', day: 'numeric' });
  return (
    <View style={styles.row}>
      <View style={styles.icon}>
        <MaterialCommunityIcons name="leaf" size={17} color={GOLD} />
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.rowName} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.rowSub}>{item.note ? `${item.note} · ` : ''}{displayDate}</Text>
      </View>
      <Text style={styles.rowAmt}>+${item.amount.toFixed(2)}</Text>
      <Pressable onPress={onDelete} hitSlop={8} style={{ marginLeft: 12 }}>
        <MaterialCommunityIcons name="trash-can-outline" size={16} color={Colors.outline} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  title: { color: Colors.text, fontSize: 22, fontWeight: '800' },
  sub: { color: Colors.outline, fontSize: 13, marginTop: 2 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: GOLD, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10 },
  addBtnText: { color: '#3A2E00', fontWeight: '700', fontSize: 13.5 },

  statRow: { flexDirection: 'row', gap: 16, marginBottom: 20, alignItems: 'stretch' },
  resetCard: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.danger + '12', borderWidth: 1, borderColor: Colors.danger + '40', borderRadius: 16, paddingHorizontal: 18 },
  resetText: { color: Colors.danger, fontSize: 13, fontWeight: '700' },

  emptyText: { color: Colors.outline, fontSize: 13 },

  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: Colors.border },
  icon: { width: 32, height: 32, borderRadius: 10, backgroundColor: GOLD + '22', alignItems: 'center', justifyContent: 'center' },
  rowBody: { flex: 1, marginLeft: 12, minWidth: 0 },
  rowName: { color: Colors.text, fontSize: 13.5, fontWeight: '600' },
  rowSub: { color: Colors.outline, fontSize: 11.5, marginTop: 1 },
  rowAmt: { color: GOLD, fontSize: 13.5, fontWeight: '700' },
});
