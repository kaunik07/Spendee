// Web override of Profile. Same data/hooks as profile.tsx (mobile). Guest
// state never applies on web (guest mode is skipped there — see useAuth.ts),
// so this omits the guest back-up-to-cloud card mobile shows.
import { MaterialCommunityIcons } from '@expo/vector-icons';
import BottomSheet from '@gorhom/bottom-sheet';
import { useRouter } from 'expo-router';
import React, { useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import AddAccountSheet from '@/components/AddAccountSheet';
import AddCreditCardSheet from '@/components/AddCreditCardSheet';
import WebPanel from '@/components/web/WebPanel';
import WebStatCard from '@/components/web/WebStatCard';
import { Colors } from '@/constants/theme';
import { useAccountsContext } from '@/store/AccountsContext';
import { useAuthContext } from '@/store/AuthContext';
import { useCreditCardsContext } from '@/store/CreditCardsContext';
import { DefaultPaymentType, useDefaultPayment } from '@/store/useDefaultPayment';

const BANK_BLUE = '#82B1FF';
const CARD_COLOR = '#E8906A';

export default function ProfileScreenWeb() {
  const router = useRouter();
  const { user } = useAuthContext();
  const { accounts, netWorth } = useAccountsContext();
  const { cards, totalOutstanding } = useCreditCardsContext();
  const accountSheetRef = useRef<BottomSheet>(null);
  const cardSheetRef = useRef<BottomSheet>(null);
  const { defaultPayment, saveDefault } = useDefaultPayment(user?.id ?? null);

  if (!user) return null;
  const trueNetWorth = netWorth - totalOutstanding;
  const initials = user.username.slice(0, 2).toUpperCase();

  const handleDefaultTypeChange = (type: DefaultPaymentType) => saveDefault(type, null);
  const handleDefaultSourceChange = (sourceId: string) => saveDefault(defaultPayment.type, defaultPayment.sourceId === sourceId ? null : sourceId);

  return (
    <View>
      <View style={styles.topbar}>
        <View style={styles.identity}>
          <View style={styles.avatar}><Text style={styles.avatarText}>{initials}</Text></View>
          <View>
            <Text style={styles.title}>{user.username}</Text>
            <Text style={styles.sub}>Member since {new Date(user.createdAt).toLocaleDateString('default', { month: 'long', year: 'numeric' })}</Text>
          </View>
        </View>
      </View>

      <View style={styles.statRow}>
        <WebStatCard label="Total Net Worth" value={`${trueNetWorth < 0 ? '−' : ''}$${Math.abs(trueNetWorth).toFixed(2)}`} valueColor={trueNetWorth >= 0 ? Colors.text : Colors.danger} />
        <WebStatCard label="Bank Accounts" value={`+$${netWorth.toFixed(2)}`} valueColor={BANK_BLUE} />
        <WebStatCard label="Credit Cards" value={`−$${totalOutstanding.toFixed(2)}`} valueColor={totalOutstanding > 0 ? CARD_COLOR : Colors.textSecondary} />
      </View>

      <View style={styles.cols}>
        <WebPanel title="Bank Accounts" linkLabel="+ Add" onLinkPress={() => accountSheetRef.current?.expand()} style={{ flex: 1 }}>
          {accounts.length === 0 ? (
            <Text style={styles.emptyText}>No accounts added yet</Text>
          ) : (
            accounts.map((a) => (
              <Pressable key={a.id} style={styles.row} onPress={() => router.push(`/account/${a.id}`)}>
                <View style={[styles.rowIcon, { backgroundColor: BANK_BLUE + '20' }]}><Text style={{ color: BANK_BLUE, fontWeight: '700' }}>{a.name.charAt(0).toUpperCase()}</Text></View>
                <Text style={styles.rowName}>{a.name}</Text>
                <Text style={[styles.rowValue, { color: BANK_BLUE }]}>${a.balance.toFixed(2)}</Text>
                <MaterialCommunityIcons name="chevron-right" size={16} color={Colors.outline} />
              </Pressable>
            ))
          )}
        </WebPanel>

        <WebPanel title="Credit Cards" linkLabel="+ Add" onLinkPress={() => cardSheetRef.current?.expand()} style={{ flex: 1 }}>
          {cards.length === 0 ? (
            <Text style={styles.emptyText}>No credit cards added yet</Text>
          ) : (
            cards.map((c) => (
              <Pressable key={c.id} style={styles.row} onPress={() => router.push(`/credit-card/${c.id}`)}>
                <View style={[styles.rowIcon, { backgroundColor: CARD_COLOR + '20' }]}><Text style={{ color: CARD_COLOR, fontWeight: '700' }}>{c.name.charAt(0).toUpperCase()}</Text></View>
                <Text style={styles.rowName}>{c.name}</Text>
                <Text style={[styles.rowValue, { color: c.outstandingBalance > 0 ? CARD_COLOR : Colors.textSecondary }]}>${c.outstandingBalance.toFixed(2)}</Text>
                <MaterialCommunityIcons name="chevron-right" size={16} color={Colors.outline} />
              </Pressable>
            ))
          )}
        </WebPanel>
      </View>

      <WebPanel title="Default Payment Method" style={{ marginTop: 20 }}>
        <Text style={styles.hint}>Pre-selects a payment source every time you add an expense.</Text>
        <View style={styles.typeRow}>
          {([{ type: null, label: 'None', icon: 'cash-remove' }, { type: 'bank_account', label: 'Bank', icon: 'bank-outline' }, { type: 'credit_card', label: 'Card', icon: 'credit-card-outline' }] as { type: DefaultPaymentType; label: string; icon: string }[]).map(({ type, label, icon }) => {
            const selected = defaultPayment.type === type;
            const color = type === 'bank_account' ? BANK_BLUE : type === 'credit_card' ? CARD_COLOR : Colors.outline;
            return (
              <Pressable key={String(type)} style={[styles.typeBtn, selected && { backgroundColor: color + '20', borderColor: color + '70' }]} onPress={() => handleDefaultTypeChange(type)}>
                <MaterialCommunityIcons name={icon as any} size={15} color={selected ? color : Colors.outline} />
                <Text style={[styles.typeBtnText, selected && { color }]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
        {defaultPayment.type === 'bank_account' && accounts.length > 0 && (
          <View style={styles.chipsWrap}>
            {accounts.map((acc) => {
              const selected = defaultPayment.sourceId === acc.id;
              return (
                <Pressable key={acc.id} style={[styles.chip, selected && { borderColor: BANK_BLUE + '80', backgroundColor: BANK_BLUE + '12' }]} onPress={() => handleDefaultSourceChange(acc.id)}>
                  <Text style={[styles.chipText, selected && { color: BANK_BLUE }]}>{acc.name}</Text>
                </Pressable>
              );
            })}
          </View>
        )}
        {defaultPayment.type === 'credit_card' && cards.length > 0 && (
          <View style={styles.chipsWrap}>
            {cards.map((c) => {
              const selected = defaultPayment.sourceId === c.id;
              return (
                <Pressable key={c.id} style={[styles.chip, selected && { borderColor: CARD_COLOR + '80', backgroundColor: CARD_COLOR + '12' }]} onPress={() => handleDefaultSourceChange(c.id)}>
                  <Text style={[styles.chipText, selected && { color: CARD_COLOR }]}>{c.name}</Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </WebPanel>

      <AddAccountSheet sheetRef={accountSheetRef} />
      <AddCreditCardSheet sheetRef={cardSheetRef} />
    </View>
  );
}

const styles = StyleSheet.create({
  topbar: { marginBottom: 20 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: { width: 56, height: 56, borderRadius: 16, backgroundColor: Colors.primaryMuted, borderWidth: 2, borderColor: Colors.primary + '40', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: Colors.primary, fontSize: 20, fontWeight: '800' },
  title: { color: Colors.text, fontSize: 20, fontWeight: '800' },
  sub: { color: Colors.outline, fontSize: 12.5, marginTop: 2 },

  statRow: { flexDirection: 'row', gap: 16, marginBottom: 20 },
  cols: { flexDirection: 'row', gap: 20 },

  emptyText: { color: Colors.outline, fontSize: 13 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border },
  rowIcon: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  rowName: { flex: 1, color: Colors.text, fontSize: 13.5, fontWeight: '600' },
  rowValue: { fontSize: 13, fontWeight: '700' },

  hint: { color: Colors.outline, fontSize: 12, marginBottom: 14 },
  typeRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  typeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background },
  typeBtnText: { color: Colors.outline, fontSize: 12.5, fontWeight: '600' },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background },
  chipText: { color: Colors.textSecondary, fontSize: 12.5, fontWeight: '600' },
});
