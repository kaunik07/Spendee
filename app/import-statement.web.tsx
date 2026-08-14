// Statement import — web only. See lib/statement/profiles/chase.ts's
// module doc-comments for why: extraction runs entirely in the browser, so
// the statement PDF never leaves the machine, and only normalized merchant
// name strings ever reach the Worker.
//
// State machine: idle -> parsing -> categorizing -> review -> committing ->
// done | error. Chase statement (docType 'statement') is the only live
// profile right now — Chase spending report is paused (see
// lib/statement/profiles/chase.ts and worker/README.md's "Supported
// documents" section) and Bank of America is listed but disabled.
import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors } from '@/constants/theme';
import { useAccountsContext } from '@/store/AccountsContext';
import { useAuthContext } from '@/store/AuthContext';
import { useCreditCardsContext } from '@/store/CreditCardsContext';
import { useExpenseContext } from '@/store/ExpenseContext';
import { commitStatementImport, undoStatementImport, type CommitImportResult, type ImportRow } from '@/store/importStatement';
import { resolveProfile, detectParser } from '@/lib/statement/registry';
import { headOf } from '@/lib/statement/detect';
import { fileSha256 } from '@/lib/statement/fingerprint';
import { buildReviewRows, type ExistingExpenseLite, type ReviewRow } from '@/lib/statement/reviewRows';
import { submitMerchantFeedback } from '@/lib/statementApi';
import type { BankId, DocType, SourceKind } from '@/lib/statement/types';
import ImportReviewTable from '@/components/web/ImportReviewTable.web';

const BANK_BLUE = '#82B1FF';
const CARD_CORAL = '#E8906A';

const KNOWN_BANKS: { id: BankId; label: string }[] = [
  { id: 'chase', label: 'Chase' },
  { id: 'bofa', label: 'Bank of America' },
];

type ScreenState =
  | { phase: 'idle' }
  | { phase: 'parsing'; filename: string }
  | { phase: 'categorizing' }
  | { phase: 'review'; period: { start: string; end: string } | null }
  | { phase: 'committing' }
  | { phase: 'done'; result: CommitImportResult; sourceName: string }
  | { phase: 'error'; message: string };

export default function ImportStatementScreen() {
  const { user, storageMode } = useAuthContext();
  const { accounts, setAccountBank } = useAccountsContext();
  const { cards, setCardBank } = useCreditCardsContext();
  const { expenses } = useExpenseContext();

  const [kind, setKind] = useState<SourceKind | null>(null);
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [screen, setScreen] = useState<ScreenState>({ phase: 'idle' });
  const inputRef = useRef<HTMLInputElement | null>(null);

  // review-phase state, lives outside `screen` since it's read/written by
  // many small handlers (per-row toggle, per-row category edit, rename) —
  // folding it into the ScreenState union would mean rebuilding the whole
  // variant on every keystroke.
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [fileName, setFileName] = useState('');
  const fileShaRef = useRef<string | null>(null);
  // merchantKey -> the user's final say, collected as edits happen and sent
  // as ONE batched /merchant-feedback call at commit — never per keystroke.
  const correctionsRef = useRef<Map<string, { category: string; subcategory: string | null }>>(new Map());

  const selected = useMemo(() => {
    if (!kind || !sourceId) return null;
    if (kind === 'bank_account') return accounts.find((a) => a.id === sourceId) ?? null;
    return cards.find((c) => c.id === sourceId) ?? null;
  }, [kind, sourceId, accounts, cards]);

  // Statement only for now — spending report is paused (see
  // lib/statement/profiles/chase.ts and worker/README.md's "Supported
  // documents" section), so there's nothing left to pick here. The doc-type
  // picker step, and the per-card/global default-type preference it used to
  // write to, come back together when spending report is re-enabled.
  const effectiveDocType: DocType = 'statement';

  const bank = selected?.bank ?? null;
  const profileLookup = bank && kind
    ? resolveProfile(bank, kind, effectiveDocType)
    : null;
  const canDrop = profileLookup?.status === 'live';

  const handlePickKind = (k: SourceKind) => {
    setKind(k);
    setSourceId(null);
  };

  const handlePickSource = (id: string) => {
    setSourceId(id);
  };

  const handleSetBank = async (b: BankId) => {
    if (!selected || !kind) return;
    if (kind === 'bank_account') await setAccountBank(selected.id, b);
    else await setCardBank(selected.id, b);
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

      setScreen({ phase: 'categorizing' });
      fileShaRef.current = await fileSha256(buf);
      setFileName(file.name);

      const existingLite: ExistingExpenseLite[] = expenses.map((e) => ({
        date: e.date, amount: e.amount, name: e.name, importFingerprint: null,
      }));
      const built = await buildReviewRows(result.txns, existingLite);
      correctionsRef.current = new Map();
      setRows(built);
      setScreen({ phase: 'review', period: result.period });
    } catch (e) {
      setScreen({ phase: 'error', message: e instanceof Error ? e.message : 'Something went wrong reading that file.' });
    }
  };

  const onDrop = (e: any) => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFile(file);
  };

  const handleToggleRow = (key: string) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, included: !r.included } : r)));
  };

  const handleToggleAll = () => {
    setRows((prev) => {
      const eligible = prev.filter((r) => !r.isCredit && r.dup?.type !== 'exact');
      const allSelected = eligible.length > 0 && eligible.every((r) => r.included);
      return prev.map((r) => (!r.isCredit && r.dup?.type !== 'exact' ? { ...r, included: !allSelected } : r));
    });
  };

  // Applies to every row sharing this merchant, not just the one clicked —
  // the same brand appears many times in a statement, and re-picking its
  // category on every occurrence is exactly the tedium this avoids.
  const handleSetCategory = (merchantKey: string, category: string, subcategory: string | null) => {
    correctionsRef.current.set(merchantKey, { category, subcategory });
    // A manual pick replaces the auto-inferred detail line too — a leftover
    // "✈ Alaska Airlines" caption under a category the user just changed
    // away from Transport would read as a bug, not a feature.
    setRows((prev) => prev.map((r) => (r.merchantKey === merchantKey ? { ...r, category, subcategory, details: null } : r)));
  };

  const handleRename = (key: string, name: string) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, name } : r)));
  };

  const handleCancelReview = () => {
    setRows([]);
    setScreen({ phase: 'idle' });
  };

  const handleCommit = async () => {
    if (screen.phase !== 'review' || !user) return;
    setScreen({ phase: 'committing' });
    try {
      const included = rows.filter((r) => r.included);
      const importRows: ImportRow[] = included.map((r) => ({
        name: r.name,
        rawDescription: r.raw.description,
        category: r.category,
        subcategory: r.subcategory,
        details: r.details,
        date: r.raw.date,
        amount: r.raw.amount,
        fingerprint: r.fingerprint,
      }));

      const result = await commitStatementImport({
        userId: user.id,
        storageMode,
        sourceFile: fileName,
        fileSha256: fileShaRef.current,
        period: screen.period,
        paymentType: kind,
        paymentSourceId: sourceId,
        rows: importRows,
      });

      if (correctionsRef.current.size > 0) {
        const corrections = [...correctionsRef.current.entries()].map(([merchantKey, c]) => ({
          merchantKey, category: c.category, subcategory: c.subcategory,
        }));
        // Never blocks the import — a correction that fails to save just
        // means that merchant gets asked about again next time.
        submitMerchantFeedback(corrections).catch(() => {});
      }

      setRows([]);
      setScreen({ phase: 'done', result, sourceName: selected?.name ?? '' });
    } catch (e) {
      setScreen({ phase: 'error', message: e instanceof Error ? e.message : 'Something went wrong importing these transactions.' });
    }
  };

  const [undoing, setUndoing] = useState(false);
  const [undone, setUndone] = useState(false);
  const handleUndo = async () => {
    if (screen.phase !== 'done') return;
    setUndoing(true);
    try {
      await undoStatementImport(screen.result.importId);
      setUndone(true);
    } catch (e) {
      setScreen({ phase: 'error', message: e instanceof Error ? e.message : 'Could not undo this import.' });
    } finally {
      setUndoing(false);
    }
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

  if (screen.phase === 'categorizing') {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator color={Colors.primary} size="large" />
        <Text style={styles.centerTitle}>Categorizing {rows.length || ''} transactions…</Text>
        <Text style={styles.centerSub}>Checking known merchants first — nothing here is written to your expenses yet.</Text>
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

  if (screen.phase === 'review' || screen.phase === 'committing') {
    return (
      <ImportReviewTable
        rows={rows}
        fileName={fileName}
        sourceName={selected?.name ?? ''}
        period={screen.phase === 'review' ? screen.period : null}
        committing={screen.phase === 'committing'}
        onToggleRow={handleToggleRow}
        onToggleAll={handleToggleAll}
        onSetCategory={handleSetCategory}
        onRename={handleRename}
        onCommit={handleCommit}
        onCancel={handleCancelReview}
      />
    );
  }

  if (screen.phase === 'done') {
    const { result, sourceName } = screen;
    return (
      <View style={styles.centerState}>
        <MaterialCommunityIcons name={undone ? 'undo-variant' : 'check-circle-outline'} size={32} color={Colors.primary} />
        <Text style={styles.centerTitle}>
          {undone ? 'Import undone' : `Imported ${result.inserted} expense${result.inserted === 1 ? '' : 's'}`}
        </Text>
        <Text style={styles.centerSub}>
          {undone
            ? 'Those expenses are gone and the balance change was reversed.'
            : `${sourceName}${result.skipped ? ` · ${result.skipped} duplicate${result.skipped === 1 ? '' : 's'} skipped` : ''} · balance moved by $${Math.abs(result.appliedDelta).toFixed(2)}`}
        </Text>
        {!undone && (
          <Pressable style={styles.retryBtn} onPress={handleUndo} disabled={undoing}>
            <Text style={styles.retryBtnText}>{undoing ? 'Undoing…' : 'Undo import'}</Text>
          </Pressable>
        )}
        <Pressable style={styles.doneBtn} onPress={() => { setUndone(false); setScreen({ phase: 'idle' }); }}>
          <Text style={styles.doneBtnText}>Done</Text>
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
              // Only 'statement' matters right now — spending report is paused.
              const supported = resolveProfile(b.id, kind!, 'statement').status !== 'unsupported';
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

      {/* Document-type step is paused along with the spending report
          profile — statement is the only option, so there's nothing to
          pick. Only a status note shows if the statement profile itself
          isn't live for this bank. */}
      {selected && bank && profileLookup?.status !== 'live' && (
        <Text style={styles.underDevNote}>
          {profileLookup?.status === 'in_development'
            ? `${profileLookup.profile.label} isn't ready yet — this bank is on the list but still being finalized.`
            : "This bank doesn't support statement import yet."}
        </Text>
      )}

      {/* Step 3 — the file */}
      {selected && bank && (
        <>
          <Text style={styles.stepLabel}>3. Drop the statement</Text>
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
  doneBtn: { marginTop: 4, paddingVertical: 10, paddingHorizontal: 20 },
  doneBtnText: { color: Colors.textSecondary, fontSize: 13, fontWeight: '700' },
});
