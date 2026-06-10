import { MaterialCommunityIcons } from '@expo/vector-icons';
import BottomSheet from '@gorhom/bottom-sheet';
import { useRouter } from 'expo-router';
import React, { useRef } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AddAccountSheet from '@/components/AddAccountSheet';
import AddCreditCardSheet from '@/components/AddCreditCardSheet';
import { useAccountsContext } from '@/store/AccountsContext';
import { useCreditCardsContext } from '@/store/CreditCardsContext';
import { useAuthContext } from '@/store/AuthContext';
import { useDefaultPayment, DefaultPaymentType } from '@/store/useDefaultPayment';
import { Colors } from '@/constants/theme';

const BANK_BLUE  = '#82B1FF';
const CARD_COLOR = '#E8906A';

export default function ProfileScreen() {
  const router = useRouter();
  const { user }                    = useAuthContext();
  const { accounts, netWorth }      = useAccountsContext();
  const { cards, totalOutstanding } = useCreditCardsContext();

  const accountSheetRef = useRef<BottomSheet>(null);
  const cardSheetRef    = useRef<BottomSheet>(null);

  const { defaultPayment, saveDefault } = useDefaultPayment(user?.id ?? null);

  if (!user) return null;

  const handleDefaultTypeChange = (type: DefaultPaymentType) => {
    saveDefault(type, null);
  };

  const handleDefaultSourceChange = (sourceId: string) => {
    const newId = defaultPayment.sourceId === sourceId ? null : sourceId;
    saveDefault(defaultPayment.type, newId);
  };

  const initials  = user.username.slice(0, 2).toUpperCase();
  const trueNetWorth = netWorth - totalOutstanding;

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profile</Text>
        <TouchableOpacity onPress={() => router.push('/settings')} hitSlop={10} style={styles.settingsBtn}>
          <MaterialCommunityIcons name="cog-outline" size={24} color={Colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>

        {/* Avatar + name */}
        <View style={styles.avatarSection}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <Text style={styles.username}>{user.username}</Text>
          <Text style={styles.memberSince}>
            Member since {new Date(user.createdAt).toLocaleDateString('default', { month: 'long', year: 'numeric' })}
          </Text>
        </View>

        {/* ── Net Worth Summary ── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Net Worth</Text>
          <View style={styles.netWorthCard}>
            <View style={styles.netWorthMain}>
              <Text style={styles.netWorthLabel}>Total Net Worth</Text>
              <Text style={[
                styles.netWorthAmount,
                { color: trueNetWorth >= 0 ? Colors.text : Colors.danger },
              ]}>
                {trueNetWorth < 0 ? '−' : ''}${Math.abs(trueNetWorth).toFixed(2)}
              </Text>
            </View>
            <View style={styles.netWorthDivider} />
            <View style={styles.netWorthBreakdown}>
              <View style={styles.breakdownRow}>
                <View style={styles.breakdownLeft}>
                  <View style={[styles.breakdownDot, { backgroundColor: BANK_BLUE }]} />
                  <Text style={styles.breakdownLabel}>Bank Accounts</Text>
                </View>
                <Text style={[styles.breakdownValue, { color: BANK_BLUE }]}>
                  +${netWorth.toFixed(2)}
                </Text>
              </View>
              <View style={styles.breakdownRow}>
                <View style={styles.breakdownLeft}>
                  <View style={[styles.breakdownDot, { backgroundColor: CARD_COLOR }]} />
                  <Text style={styles.breakdownLabel}>Credit Cards</Text>
                </View>
                <Text style={[styles.breakdownValue, { color: totalOutstanding > 0 ? CARD_COLOR : Colors.textSecondary }]}>
                  −${totalOutstanding.toFixed(2)}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── Bank Accounts ── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Bank Accounts</Text>

          <View style={styles.listCard}>
            {accounts.length === 0 ? (
              <View style={styles.emptyRow}>
                <Text style={styles.emptyText}>No accounts added yet</Text>
              </View>
            ) : (
              accounts.map((account, index) => (
                <TouchableOpacity
                  key={account.id}
                  style={[styles.itemRow, index < accounts.length - 1 && styles.itemRowDivider]}
                  onPress={() => router.push(`/account/${account.id}`)}
                  activeOpacity={0.7}
                >
                  <View style={styles.itemLeft}>
                    <View style={[styles.itemIconBox, { backgroundColor: BANK_BLUE + '20' }]}>
                      <Text style={[styles.itemIconText, { color: BANK_BLUE }]}>
                        {account.name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <Text style={styles.itemName}>{account.name}</Text>
                  </View>
                  <View style={styles.itemRight}>
                    <Text style={[styles.itemValue, { color: BANK_BLUE }]}>
                      ${account.balance.toFixed(2)}
                    </Text>
                    <MaterialCommunityIcons name="chevron-right" size={16} color={Colors.outline} />
                  </View>
                </TouchableOpacity>
              ))
            )}
          </View>

          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => accountSheetRef.current?.expand()}
            activeOpacity={0.8}>
            <MaterialCommunityIcons name="plus" size={17} color={Colors.textSecondary} />
            <Text style={styles.addBtnText}>Add Account</Text>
          </TouchableOpacity>
        </View>

        {/* ── Credit Cards ── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Credit Cards</Text>

          <View style={styles.listCard}>
            {cards.length === 0 ? (
              <View style={styles.emptyRow}>
                <Text style={styles.emptyText}>No credit cards added yet</Text>
              </View>
            ) : (
              cards.map((card, index) => (
                <TouchableOpacity
                  key={card.id}
                  style={[styles.itemRow, index < cards.length - 1 && styles.itemRowDivider]}
                  onPress={() => router.push(`/credit-card/${card.id}`)}
                  activeOpacity={0.7}
                >
                  <View style={styles.itemLeft}>
                    <View style={[styles.itemIconBox, { backgroundColor: CARD_COLOR + '20' }]}>
                      <Text style={[styles.itemIconText, { color: CARD_COLOR }]}>
                        {card.name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View>
                      <Text style={styles.itemName}>{card.name}</Text>
                      {card.creditLimit != null && (
                        <Text style={styles.itemSubLabel}>
                          Limit: ${card.creditLimit.toFixed(0)}
                        </Text>
                      )}
                    </View>
                  </View>
                  <View style={styles.itemRight}>
                    <Text style={[
                      styles.itemValue,
                      { color: card.outstandingBalance > 0 ? CARD_COLOR : Colors.textSecondary },
                    ]}>
                      ${card.outstandingBalance.toFixed(2)}
                    </Text>
                    <MaterialCommunityIcons name="chevron-right" size={16} color={Colors.outline} />
                  </View>
                </TouchableOpacity>
              ))
            )}
          </View>

          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => cardSheetRef.current?.expand()}
            activeOpacity={0.8}>
            <MaterialCommunityIcons name="plus" size={17} color={Colors.textSecondary} />
            <Text style={styles.addBtnText}>Add Credit Card</Text>
          </TouchableOpacity>
        </View>

        {/* ── Default Payment ── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Default Payment Method</Text>
          <View style={styles.listCard}>
            <View style={styles.defaultPaymentInner}>
              <Text style={styles.defaultPaymentHint}>
                Pre-selects a payment source every time you add an expense.
              </Text>
              {/* Type toggle */}
              <View style={styles.defaultTypeRow}>
                {([
                  { type: null,           label: 'None',    icon: 'cash-remove' },
                  { type: 'bank_account', label: 'Bank',    icon: 'bank-outline' },
                  { type: 'credit_card',  label: 'Card',    icon: 'credit-card-outline' },
                ] as { type: DefaultPaymentType; label: string; icon: string }[]).map(({ type, label, icon }) => {
                  const selected = defaultPayment.type === type;
                  const color = type === 'bank_account' ? BANK_BLUE : type === 'credit_card' ? CARD_COLOR : Colors.outline;
                  return (
                    <TouchableOpacity
                      key={String(type)}
                      style={[styles.defaultTypeBtn, selected && { backgroundColor: color + '20', borderColor: color + '70' }]}
                      onPress={() => handleDefaultTypeChange(type)}
                      activeOpacity={0.75}>
                      <MaterialCommunityIcons name={icon as any} size={16} color={selected ? color : Colors.outline} />
                      <Text style={[styles.defaultTypeBtnText, selected && { color }]}>{label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Source chips for bank accounts */}
              {defaultPayment.type === 'bank_account' && accounts.length > 0 && (
                <View style={styles.sourceChipsWrap}>
                  {accounts.map((acc) => {
                    const selected = defaultPayment.sourceId === acc.id;
                    return (
                      <TouchableOpacity
                        key={acc.id}
                        style={[styles.sourceChip, selected && { borderColor: BANK_BLUE + '80', backgroundColor: BANK_BLUE + '12' }]}
                        onPress={() => handleDefaultSourceChange(acc.id)}
                        activeOpacity={0.75}>
                        <MaterialCommunityIcons name="bank-outline" size={13} color={selected ? BANK_BLUE : Colors.outline} />
                        <Text style={[styles.sourceChipText, selected && { color: BANK_BLUE }]}>{acc.name}</Text>
                        {selected && <MaterialCommunityIcons name="check-circle" size={13} color={BANK_BLUE} />}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {/* Source chips for credit cards */}
              {defaultPayment.type === 'credit_card' && cards.length > 0 && (
                <View style={styles.sourceChipsWrap}>
                  {cards.map((card) => {
                    const selected = defaultPayment.sourceId === card.id;
                    return (
                      <TouchableOpacity
                        key={card.id}
                        style={[styles.sourceChip, selected && { borderColor: CARD_COLOR + '80', backgroundColor: CARD_COLOR + '12' }]}
                        onPress={() => handleDefaultSourceChange(card.id)}
                        activeOpacity={0.75}>
                        <MaterialCommunityIcons name="credit-card-outline" size={13} color={selected ? CARD_COLOR : Colors.outline} />
                        <Text style={[styles.sourceChipText, selected && { color: CARD_COLOR }]}>{card.name}</Text>
                        {selected && <MaterialCommunityIcons name="check-circle" size={13} color={CARD_COLOR} />}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {defaultPayment.type !== null && defaultPayment.sourceId && (
                <Text style={styles.defaultActiveNote}>
                  Expenses will default to {defaultPayment.type === 'bank_account'
                    ? accounts.find((a) => a.id === defaultPayment.sourceId)?.name
                    : cards.find((c) => c.id === defaultPayment.sourceId)?.name}
                </Text>
              )}
            </View>
          </View>
        </View>

      </ScrollView>

      <AddAccountSheet sheetRef={accountSheetRef} />
      <AddCreditCardSheet sheetRef={cardSheetRef} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 12,
  },
  backBtn:     { padding: 2 },
  settingsBtn: { padding: 2 },
  headerTitle: { color: Colors.text, fontSize: 17, fontWeight: '700' },

  content: { paddingHorizontal: 18, paddingBottom: 48 },

  avatarSection: { alignItems: 'center', paddingVertical: 32 },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: Colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    borderWidth: 2,
    borderColor: Colors.primary + '40',
  },
  avatarText:  { color: Colors.primary, fontSize: 28, fontWeight: '800' },
  username:    { color: Colors.text, fontSize: 22, fontWeight: '800', letterSpacing: -0.3 },
  memberSince: { color: Colors.textSecondary, fontSize: 13, marginTop: 4 },

  section:      { marginBottom: 24 },
  sectionLabel: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 10,
    marginLeft: 4,
  },

  // Net Worth summary card
  netWorthCard: {
    backgroundColor: Colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  netWorthMain: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  netWorthLabel:  { color: Colors.textSecondary, fontSize: 13, fontWeight: '600' },
  netWorthAmount: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  netWorthDivider: { height: 1, backgroundColor: Colors.border },
  netWorthBreakdown: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  breakdownLeft:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  breakdownDot:   { width: 8, height: 8, borderRadius: 4 },
  breakdownLabel: { color: Colors.textSecondary, fontSize: 13 },
  breakdownValue: { fontSize: 13, fontWeight: '600' },

  // Shared list card (accounts + credit cards)
  listCard: {
    backgroundColor: Colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    marginBottom: 10,
  },
  emptyRow:  { paddingHorizontal: 16, paddingVertical: 18 },
  emptyText: { color: Colors.textMuted, fontSize: 13, textAlign: 'center' },

  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  itemRowDivider: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  itemLeft:       { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  itemRight:      { flexDirection: 'row', alignItems: 'center', gap: 4 },
  itemIconBox: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  itemIconText: { fontSize: 15, fontWeight: '700' },
  itemName:     { color: Colors.text, fontSize: 14, fontWeight: '600' },
  itemSubLabel: { color: Colors.textMuted, fontSize: 11, marginTop: 1 },
  itemValue:    { fontSize: 13, fontWeight: '600' },

  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  addBtnText: { color: Colors.textSecondary, fontSize: 14, fontWeight: '600' },

  defaultPaymentInner: { padding: 16, gap: 14 },
  defaultPaymentHint:  { color: Colors.textMuted, fontSize: 12 },
  defaultTypeRow:      { flexDirection: 'row', gap: 8 },
  defaultTypeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  defaultTypeBtnText: { color: Colors.outline, fontSize: 12, fontWeight: '600' },
  sourceChipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sourceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  sourceChipText:    { color: Colors.textSecondary, fontSize: 13, fontWeight: '600' },
  defaultActiveNote: { color: Colors.textMuted, fontSize: 12, fontStyle: 'italic' },
});
