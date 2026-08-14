// Statement import — web only. See lib/statement/README (the module
// doc-comments) for why: extraction runs entirely in the browser, so the
// statement PDF never leaves the machine, and only normalized merchant name
// strings ever reach the Worker.
//
// State machine: idle -> parsing -> review -> committing -> done | error.
// This file covers idle/parsing/error; review/committing/done are built in
// the commits that follow, once there's a live bank profile to reach them
// with (see lib/statement/registry.ts — every profile today is
// 'in_development', so the dropzone below is honest about not being usable
// yet rather than pretending otherwise).
import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors } from '@/constants/theme';
import { useAccountsContext } from '@/store/AccountsContext';
import { useAuthContext } from '@/store/AuthContext';
import { useCreditCardsContext } from '@/store/CreditCardsContext';
import { useImportPrefs } from '@/store/useImportPrefs';
import { resolveProfile, detectParser } from '@/lib/statement/registry';
import { headOf } from '@/lib/statement/detect';
import type { BankId, DocType, SourceKind } from '@/lib/statement/types';

const BANK_BLUE = '#82B1FF';
const CARD_CORAL = '#E8906A';

const KNOWN_BANKS: { id: BankId; label: string }[] = [
  { id: 'chase', label: 'Chase' },
  { id: 'bofa', label: 'Bank of America' },
];

type ScreenState =
  | { phase: 'idle' }
  | { phase: 'parsing'; filename: string }
  | { phase: 'error'; message: string };

export default function ImportStatementScreen() {
  const { user } = useAuthContext();
  const { accounts, setAccountBank, setAccountDefaultDocType } = useAccountsContext();
  const { cards, setCardBank, setCardDefaultDocType } = useCreditCardsContext();
  const { prefs, setDefaultDocType: setGlobalDefaultDocType } = useImportPrefs(user?.id ?? null);

  const [kind, setKind] = useState<SourceKind | null>(null);
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [docType, setDocType] = useState<DocType | null>(null);
  const [screen, setScreen] = useState<ScreenState>({ phase: 'idle' });
  const inputRef = useRef<HTMLInputElement | null>(null);

  const selected = useMemo(() => {
    if (!kind || !sourceId) return null;
    if (kind === 'bank_account') return accounts.find((a) => a.id === sourceId) ?? null;
    return cards.find((c) => c.id === sourceId) ?? null;
  }, [kind, sourceId, accounts, cards]);

  // Resolve the doc-type control's value the first time a source is picked,
  // from the card's own override, else the global preference, else 'statement'.
  const effectiveDocType: DocType = docType ?? selected?.defaultDocType ?? prefs.defaultDocType;

  const bank = selected?.bank ?? null;
  const profileLookup = bank && effectiveDocType && kind
    ? resolveProfile(bank, kind, effectiveDocType)
    : null;
  const canDrop = profileLookup?.status === 'live';

  const handlePickKind = (k: SourceKind) => {
    setKind(k);
    setSourceId(null);
    setDocType(null);
  };

  const handlePickSource = (id: string) => {
    setSourceId(id);
    setDocType(null); // re-resolve from the newly-selected record's own override
  };

  const handleSetBank = async (b: BankId) => {
    if (!selected || !kind) return;
    if (kind === 'bank_account') await setAccountBank(selected.id, b);
    else await setCardBank(selected.id, b);
  };

  const handleSetDocType = async (dt: DocType, asDefault: boolean) => {
    setDocType(dt);
    if (asDefault && selected && kind) {
      if (kind === 'bank_account') await setAccountDefaultDocType(selected.id, dt);
      else await setCardDefaultDocType(selected.id, dt);
    }
  };

  const handleFile = async (file: File) => {
    setScreen({ phase: 'parsing', filename: file.name });
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      const parser = detectParser(headOf(buf));
      if (!parser) {
        setScreen({ phase: 'error', message: 'Only PDF statements are supported right now.' });
        return;
      }
      if (!profileLookup || profileLookup.status !== 'live') {
        setScreen({ phase: 'error', message: "This bank and document type aren't supported yet." });
        return;
      }
      const result = await parser.parse(buf, profileLookup.profile);
      if (!result.ok) {
        setScreen({ phase: 'error', message: result.message });
        return;
      }
      // Review screen lands in a follow-up commit — for now, land back on
      // idle with a visible confirmation that parsing genuinely worked.
      setScreen({ phase: 'error', message: `Parsed ${result.txns.length} transaction(s). Review screen coming next.` });
    } catch (e) {
      setScreen({ phase: 'error', message: e instanceof Error ? e.message : 'Something went wrong reading that file.' });
    }
  };

  const onDrop = (e: any) => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFile(file);
  };

  if (screen.phase === 'parsing') {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator color={Colors.primary} size="large" />
        <Text style={styles.centerTitle}>Reading {screen.filename}…</Text>
        <Text style={styles.centerSub}>This happens on your device — the file never uploads anywhere.</Text>
      </View>
    );
  }

  if (screen.phase === 'error') {
    return (
      <View style={styles.centerState}>
        <MaterialCommunityIcons name="alert-circle-outline" size={32} color={Colors.danger} />
        <Text style={styles.centerTitle}>{screen.message}</Text>
        <Pressable style={styles.retryBtn} onPress={() => setScreen({ phase: 'idle' })}>
          <Text style={styles.retryBtnText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View>
      <Text style={styles.title}>Import Statement</Text>
      <Text style={styles.sub}>Upload a bank or credit card statement to add its transactions as expenses.</Text>

      {/* Step 1 — source type */}
      <Text style={styles.stepLabel}>1. Where is this statement from?</Text>
      <View style={styles.toggleRow}>
        {([
          { k: 'credit_card' as SourceKind, label: 'Credit Card', icon: 'credit-card-outline', color: CARD_CORAL },
          { k: 'bank_account' as SourceKind, label: 'Bank Account', icon: 'bank-outline', color: BANK_BLUE },
        ]).map(({ k, label, icon, color }) => {
          const isSelected = kind === k;
          return (
            <Pressable
              key={k}
              onPress={() => handlePickKind(k)}
              style={[styles.toggleBtn, isSelected && { backgroundColor: color + '20', borderColor: color + '60' }]}>
              <MaterialCommunityIcons name={icon as any} size={16} color={isSelected ? color : Colors.outline} />
              <Text style={[styles.toggleBtnText, isSelected && { color }]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* Step 1b — specific card/account */}
      {kind && (
        <View style={styles.chipsRow}>
          {(kind === 'credit_card' ? cards : accounts).map((rec) => {
            const isSelected = sourceId === rec.id;
            const color = kind === 'credit_card' ? CARD_CORAL : BANK_BLUE;
            const balance = 'outstandingBalance' in rec ? rec.outstandingBalance : rec.balance;
            return (
              <Pressable
                key={rec.id}
                onPress={() => handlePickSource(rec.id)}
                style={[styles.chip, isSelected && { borderColor: color + '80', backgroundColor: color + '14' }]}>
                <View style={[styles.chipDot, { backgroundColor: isSelected ? color : Colors.outline }]} />
                <View>
                  <Text style={[styles.chipName, isSelected && { color }]}>{rec.name}</Text>
                  <Text style={styles.chipSub}>${balance.toFixed(2)}</Text>
                </View>
              </Pressable>
            );
          })}
          {(kind === 'credit_card' ? cards : accounts).length === 0 && (
            <Text style={styles.emptyNote}>
              {kind === 'credit_card' ? 'No credit cards yet.' : 'No bank accounts yet.'} Add one first.
            </Text>
          )}
        </View>
      )}

      {/* Step 2 — bank picker, only when the selected record has no bank set */}
      {selected && !bank && (
        <>
          <Text style={styles.stepLabel}>2. Which bank issued this {kind === 'credit_card' ? 'card' : 'account'}?</Text>
          <Text style={styles.stepHint}>Asked once — saved to this {kind === 'credit_card' ? 'card' : 'account'} so it isn't asked again.</Text>
          <View style={styles.toggleRow}>
            {KNOWN_BANKS.map((b) => {
              const supported = resolveProfile(b.id, kind!, 'statement').status !== 'unsupported'
                || resolveProfile(b.id, kind!, 'spending_report').status !== 'unsupported';
              return (
                <Pressable
                  key={b.id}
                  disabled={!supported}
                  onPress={() => handleSetBank(b.id)}
                  style={[styles.toggleBtn, !supported && styles.toggleBtnDisabled]}>
                  <Text style={[styles.toggleBtnText, !supported && styles.toggleBtnTextDisabled]}>{b.label}</Text>
                  {!supported && <Text style={styles.underDevTag}>Under development</Text>}
                </Pressable>
              );
            })}
          </View>
        </>
      )}

      {/* Step 3 — document type */}
      {selected && bank && (
        <>
          <Text style={styles.stepLabel}>3. What kind of document is this?</Text>
          <View style={styles.toggleRow}>
            {([
              { dt: 'statement' as DocType, label: 'Statement' },
              { dt: 'spending_report' as DocType, label: 'Spending Report' },
            ]).map(({ dt, label }) => {
              const isSelected = effectiveDocType === dt;
              return (
                <Pressable
                  key={dt}
                  onPress={() => handleSetDocType(dt, true)}
                  style={[styles.toggleBtn, isSelected && styles.toggleBtnSelectedPrimary]}>
                  <Text style={[styles.toggleBtnText, isSelected && styles.toggleBtnTextSelectedPrimary]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>

          {profileLookup?.status === 'in_development' && (
            <Text style={styles.underDevNote}>
              {profileLookup.profile.label} isn't ready yet — this combination is on the list but still being finalized.
            </Text>
          )}
          {profileLookup?.status === 'unsupported' && (
            <Text style={styles.underDevNote}>This bank doesn't support that document type.</Text>
          )}
        </>
      )}

      {/* Step 4 — the file */}
      {selected && bank && (
        <>
          <Text style={styles.stepLabel}>4. Drop the statement</Text>
          <Pressable
            disabled={!canDrop}
            onPress={() => inputRef.current?.click()}
            // @ts-expect-error — web-only drag handler, RN types don't know about it
            onDragOver={(e: any) => e.preventDefault()}
            onDrop={onDrop}
            style={[styles.dropzone, !canDrop && styles.dropzoneDisabled]}>
            <MaterialCommunityIcons name="file-upload-outline" size={28} color={canDrop ? Colors.primary : Colors.outline} />
            <Text style={[styles.dropzoneText, !canDrop && { color: Colors.outline }]}>
              {canDrop ? 'Click or drag a PDF here' : 'Not available for this bank yet'}
            </Text>
          </Pressable>
          {React.createElement('input', {
            ref: inputRef,
            type: 'file',
            accept: 'application/pdf',
            style: { display: 'none' },
            onChange: (e: any) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
              e.target.value = '';
            },
          })}
          <Text style={styles.footNote}>Only debits import as expenses. Credits and payments are shown but excluded by default.</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { color: Colors.text, fontSize: 22, fontWeight: '800' },
  sub: { color: Colors.outline, fontSize: 13, marginTop: 2, marginBottom: 8 },

  stepLabel: { color: Colors.text, fontSize: 14, fontWeight: '700', marginTop: 26, marginBottom: 6 },
  stepHint: { color: Colors.textSecondary, fontSize: 12, marginBottom: 10 },

  toggleRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' as any },
  toggleBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 10, paddingHorizontal: 16,
    borderRadius: 12, borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.surfaceContainer,
  },
  toggleBtnDisabled: { opacity: 0.5 },
  toggleBtnSelectedPrimary: { backgroundColor: Colors.primaryMuted, borderColor: Colors.primary + '60' },
  toggleBtnText: { color: Colors.outline, fontSize: 13, fontWeight: '600' },
  toggleBtnTextDisabled: { color: Colors.outline },
  toggleBtnTextSelectedPrimary: { color: Colors.primary },
  underDevTag: { color: Colors.outline, fontSize: 10, marginLeft: 6 },
  underDevNote: { color: Colors.textSecondary, fontSize: 12.5, marginTop: 10 },

  chipsRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' as any, marginTop: 12 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 8, paddingHorizontal: 12,
    borderRadius: 10, borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.surfaceContainer,
  },
  chipDot: { width: 7, height: 7, borderRadius: 4 },
  chipName: { color: Colors.text, fontSize: 13, fontWeight: '600' },
  chipSub: { color: Colors.textSecondary, fontSize: 11, marginTop: 1 },
  emptyNote: { color: Colors.outline, fontSize: 13 },

  dropzone: {
    borderWidth: 1.5, borderStyle: 'dashed' as any, borderColor: Colors.primary + '50',
    borderRadius: 16, paddingVertical: 36,
    alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: Colors.surfaceContainer,
    cursor: 'pointer' as any,
  },
  dropzoneDisabled: { borderColor: Colors.border, cursor: 'not-allowed' as any },
  dropzoneText: { color: Colors.text, fontSize: 13.5, fontWeight: '600' },
  footNote: { color: Colors.outline, fontSize: 11.5, marginTop: 10 },

  centerState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 80, gap: 12 },
  centerTitle: { color: Colors.text, fontSize: 15, fontWeight: '700', textAlign: 'center', maxWidth: 420 },
  centerSub: { color: Colors.textSecondary, fontSize: 12.5, textAlign: 'center', maxWidth: 380 },
  retryBtn: {
    marginTop: 6, paddingVertical: 10, paddingHorizontal: 20,
    borderRadius: 10, backgroundColor: Colors.primaryMuted,
  },
  retryBtnText: { color: Colors.primary, fontSize: 13, fontWeight: '700' },
});
