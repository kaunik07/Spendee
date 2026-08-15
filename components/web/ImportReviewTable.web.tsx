// Statement import — the review table. The mandatory human-review step
// before anything reaches the database: every row here is a checkbox away
// from being written, and nothing is written until "Import N expenses" is
// pressed (app/import-statement.web.tsx owns that call).
//
// Three regions, matching the approved mockup:
//   - normal rows (included by default, near-duplicates flagged but still
//     included — a re-download of an overlapping period is the common case,
//     and a genuine same-day repeat purchase is common too; a merchant
//     refund lives here too, shown with a "Refund" chip and a negative
//     amount — it touched a category and belongs in the total, unlike a
//     payment)
//   - exact duplicates — collapsed, unchecked, never counted
//   - payments & credits — collapsed, unchecked, excluded from the total.
//     Only a genuine payment mechanism (autopay, bank transfer — see
//     lib/statement/refund.ts) lands here; a merchant refund is a normal
//     row, not a credit.
import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Colors, getCategoryById } from '@/constants/theme';
import { getSubcategoryById } from '@/constants/subcategories';
import type { ReviewRow } from '@/lib/statement/reviewRows';
import { formatSignedAmount, signedAmountColor } from '@/lib/money';
import CategoryPopover from './CategoryPopover.web';

interface Props {
  rows: ReviewRow[];
  fileName: string;
  sourceName: string;
  period: { start: string; end: string } | null;
  committing: boolean;
  onToggleRow: (key: string) => void;
  onToggleAll: () => void;
  onSetCategory: (merchantKey: string, category: string, subcategory: string | null) => void;
  onRename: (key: string, name: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}

const DETAIL_ICON: Record<string, string> = {
  airline: 'airplane', provider: 'car', company: 'car-key', restaurant: 'silverware-fork-knife', store: 'storefront-outline',
};

function money(n: number) {
  return `$${n.toFixed(2)}`;
}

function CategoryCell({ row, onOpen }: { row: ReviewRow; onOpen: (e: any) => void }) {
  const cat = getCategoryById(row.category);
  const sub = getSubcategoryById(row.category, row.subcategory);
  const detailEntry = row.details ? Object.entries(row.details)[0] : null;
  return (
    <Pressable style={styles.catCell} onPress={onOpen}>
      <View style={[styles.pill, { backgroundColor: cat.color + '1A' }]}>
        <View style={[styles.swatch, { backgroundColor: cat.color }]} />
        <Text style={[styles.pillText, { color: cat.color }]}>{cat.label}</Text>
        {sub && (
          <>
            <Text style={[styles.pillSep, { color: cat.color }]}>·</Text>
            <Text style={[styles.pillSub, { color: cat.color }]}>{sub.label}</Text>
          </>
        )}
      </View>
      {detailEntry && (
        <View style={styles.detailLine}>
          <MaterialCommunityIcons name={(DETAIL_ICON[detailEntry[0]] ?? 'information-outline') as any} size={11} color={Colors.textMuted} />
          <Text style={styles.detailText}>{detailEntry[1]}</Text>
        </View>
      )}
    </Pressable>
  );
}

function Row({ row, onToggle, onOpenCategory, onRename }: {
  row: ReviewRow;
  onToggle: () => void;
  onOpenCategory: (e: any) => void;
  onRename: (name: string) => void;
}) {
  const muted = row.isCredit || row.dup?.type === 'exact';
  return (
    <View style={[styles.row, muted && styles.rowMuted]}>
      <Pressable style={styles.chkCell} onPress={onToggle}>
        <View style={[styles.checkbox, row.included && styles.checkboxOn]}>
          {row.included && <MaterialCommunityIcons name="check" size={11} color={Colors.onPrimary} />}
        </View>
      </Pressable>
      <Text style={styles.dateCell}>{formatShortDate(row.raw.date)}</Text>
      <View style={styles.nameCell}>
        <View style={styles.nameRow}>
          <TextInput
            value={row.name}
            onChangeText={onRename}
            style={styles.nameInput}
            editable={!row.isCredit}
          />
          {row.dup?.type === 'exact' && <Text style={[styles.chip, styles.chipDup]}>Duplicate</Text>}
          {row.dup?.type === 'near' && <Text style={[styles.chip, styles.chipDup]}>Possible duplicate</Text>}
          {row.isCredit && <Text style={[styles.chip, styles.chipCredit]}>Credit</Text>}
          {row.isRefund && <Text style={[styles.chip, styles.chipRefund]}>Refund</Text>}
        </View>
        <Text style={styles.rawText} numberOfLines={1}>{row.raw.description}</Text>
        {row.dup?.note && <Text style={styles.dupNote}>{row.dup.note}</Text>}
      </View>
      <Text style={[styles.amountCell, row.isCredit && styles.amountCredit, row.isRefund && { color: signedAmountColor(row.signedAmount) }]}>
        {row.isCredit ? `–${money(row.raw.amount)}` : formatSignedAmount(row.signedAmount)}
      </Text>
      <CategoryCell row={row} onOpen={onOpenCategory} />
    </View>
  );
}

function formatShortDate(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${MONTHS[m - 1]} ${d}`;
}

export default function ImportReviewTable({
  rows, fileName, sourceName, period, committing,
  onToggleRow, onToggleAll, onSetCategory, onRename, onCommit, onCancel,
}: Props) {
  const [dupsOpen, setDupsOpen] = useState(false);
  const [creditsOpen, setCreditsOpen] = useState(false);
  const [popover, setPopover] = useState<{ merchantKey: string; category: string; subcategory: string | null; top: number; left: number } | null>(null);
  const [bulkPopover, setBulkPopover] = useState<{ top: number; left: number } | null>(null);
  const bulkBtnRef = useRef<View>(null);

  const normalRows = useMemo(() => rows.filter((r) => !r.isCredit && r.dup?.type !== 'exact'), [rows]);
  const exactDupRows = useMemo(() => rows.filter((r) => r.dup?.type === 'exact'), [rows]);
  const creditRows = useMemo(() => rows.filter((r) => r.isCredit), [rows]);

  const included = rows.filter((r) => r.included);
  // Signed — a refund subtracts from the total rather than adding to it,
  // same as it will once written as a negative Expense.amount.
  const total = included.reduce((s, r) => s + r.signedAmount, 0);
  const creditsTotal = creditRows.reduce((s, r) => s + r.raw.amount, 0);
  const allSelected = normalRows.length > 0 && normalRows.every((r) => r.included);

  const openRowPopover = (row: ReviewRow, e: any) => {
    const { pageX, pageY } = e.nativeEvent ?? e;
    setPopover({ merchantKey: row.merchantKey, category: row.category, subcategory: row.subcategory, top: pageY + 10, left: Math.min(pageX - 140, 900) });
  };

  const openBulkPopover = () => {
    bulkBtnRef.current?.measureInWindow((x: number, y: number, _w: number, h: number) => {
      setBulkPopover({ top: y + h + 8, left: x });
    });
  };

  return (
    <View>
      <Text style={styles.eyebrow}>{sourceName} · <Text style={styles.eyebrowFile}>{fileName}</Text></Text>
      <Text style={styles.h1}>Review before importing</Text>
      <Text style={styles.subhead}>
        Nothing is added to your expenses until you confirm below. <Text style={styles.bold}>{included.length} of {rows.length}</Text> parsed transactions are selected.
      </Text>

      <View style={styles.stats}>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>Period</Text>
          <Text style={styles.statValue}>{period ? `${formatShortDate(period.start)} – ${formatShortDate(period.end)}` : '—'}</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>Selected</Text>
          <Text style={[styles.statValue, styles.statAccent]}>{included.length}</Text>
          <Text style={styles.statSub}>of {rows.length} parsed</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>Total to import</Text>
          <Text style={[styles.statValue, { color: signedAmountColor(total) }]}>{formatSignedAmount(total)}</Text>
          <Text style={styles.statSub}>debits and refunds, net</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>Skipped</Text>
          <Text style={styles.statValue}>{exactDupRows.length}</Text>
          <Text style={styles.statSub}>already imported</Text>
        </View>
      </View>

      <View style={styles.toolbar}>
        <Pressable style={styles.toolbarSelect} onPress={onToggleAll}>
          <View style={[styles.checkbox, allSelected && styles.checkboxOn]}>
            {allSelected && <MaterialCommunityIcons name="check" size={11} color={Colors.onPrimary} />}
          </View>
          <Text style={styles.toolbarSelectText}>{allSelected ? 'Deselect all' : 'Select all'}</Text>
        </Pressable>
        <View ref={bulkBtnRef} collapsable={false}>
          <Pressable style={styles.btnGhost} onPress={openBulkPopover}>
            <Text style={styles.btnGhostText}>Set category for selected</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.tableWrap}>
        <ScrollView horizontal contentContainerStyle={styles.tableContent}>
          <View style={styles.tableInner}>
            <View style={styles.theadRow}>
              <Text style={[styles.th, styles.thChk]}></Text>
              <Text style={[styles.th, styles.thDate]}>Date</Text>
              <Text style={[styles.th, styles.thName]}>Merchant</Text>
              <Text style={[styles.th, styles.thAmount]}>Amount</Text>
              <Text style={[styles.th, styles.thCat]}>Category</Text>
            </View>

            {normalRows.map((row) => (
              <Row
                key={row.key}
                row={row}
                onToggle={() => onToggleRow(row.key)}
                onOpenCategory={(e) => openRowPopover(row, e)}
                onRename={(name) => onRename(row.key, name)}
              />
            ))}

            {exactDupRows.length > 0 && (
              <>
                <Pressable style={styles.sectionRow} onPress={() => setDupsOpen((v) => !v)}>
                  <Text style={styles.sectionText}>
                    <Text style={styles.caret}>{dupsOpen ? '▾' : '▸'}</Text> {exactDupRows.length} already imported — skipped, not counted above
                  </Text>
                </Pressable>
                {dupsOpen && exactDupRows.map((row) => (
                  <Row key={row.key} row={row} onToggle={() => onToggleRow(row.key)} onOpenCategory={(e) => openRowPopover(row, e)} onRename={(name) => onRename(row.key, name)} />
                ))}
              </>
            )}

            {creditRows.length > 0 && (
              <>
                <Pressable style={styles.sectionRow} onPress={() => setCreditsOpen((v) => !v)}>
                  <Text style={styles.sectionText}>
                    <Text style={styles.caret}>{creditsOpen ? '▾' : '▸'}</Text> {creditRows.length} payments &amp; credits — {money(creditsTotal)}, excluded from the total above
                  </Text>
                </Pressable>
                {creditsOpen && creditRows.map((row) => (
                  <Row key={row.key} row={row} onToggle={() => onToggleRow(row.key)} onOpenCategory={(e) => openRowPopover(row, e)} onRename={(name) => onRename(row.key, name)} />
                ))}
              </>
            )}
          </View>
        </ScrollView>
      </View>

      <Text style={styles.footNote}>Debits and merchant refunds import as expenses. Payments (autopay, bank transfers) are shown but excluded by default.</Text>

      <View style={styles.footerPad} />

      {popover && (
        <CategoryPopover
          visible
          position={{ top: popover.top, left: popover.left }}
          currentCategory={popover.category}
          currentSubcategory={popover.subcategory}
          onSelect={(category, subcategory) => onSetCategory(popover.merchantKey, category, subcategory)}
          onClose={() => setPopover(null)}
        />
      )}
      {bulkPopover && (
        <CategoryPopover
          visible
          position={bulkPopover}
          currentCategory=""
          currentSubcategory={null}
          onSelect={(category, subcategory) => {
            for (const r of included) onSetCategory(r.merchantKey, category, subcategory);
          }}
          onClose={() => setBulkPopover(null)}
        />
      )}

      <View style={styles.footer}>
        <View style={styles.footerSummary}>
          <Text style={styles.footerHeadline}>Import {included.length} expense{included.length === 1 ? '' : 's'} · <Text style={[styles.footerAmt, { color: signedAmountColor(total) }]}>{formatSignedAmount(total)}</Text></Text>
          <Text style={styles.footerSub}>{sourceName} — outstanding balance changes by this amount</Text>
        </View>
        <View style={styles.footerSpacer} />
        <Pressable style={styles.btnCancel} onPress={onCancel} disabled={committing}>
          <Text style={styles.btnCancelText}>Cancel</Text>
        </Pressable>
        <Pressable style={[styles.btnPrimary, (committing || included.length === 0) && styles.btnPrimaryDisabled]} onPress={onCommit} disabled={committing || included.length === 0}>
          <Text style={styles.btnPrimaryText}>{committing ? 'Importing…' : `Import ${included.length} expense${included.length === 1 ? '' : 's'}`}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  eyebrow: { color: Colors.textMuted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  eyebrowFile: { color: Colors.textSecondary, textTransform: 'none', fontWeight: '600' },
  h1: { color: Colors.text, fontSize: 21, fontWeight: '800' },
  subhead: { color: Colors.textSecondary, fontSize: 13.5, marginTop: 4, marginBottom: 20 },
  bold: { color: Colors.text, fontWeight: '700' },

  stats: { flexDirection: 'row', gap: 10, marginBottom: 18, flexWrap: 'wrap' as any },
  stat: { flexGrow: 1, minWidth: 140, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 14, padding: 14 },
  statLabel: { color: Colors.textMuted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 },
  statValue: { color: Colors.text, fontSize: 18, fontWeight: '800' },
  statAccent: { color: Colors.primary },
  statSub: { color: Colors.textMuted, fontSize: 11, marginTop: 2 },

  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  toolbarSelect: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  toolbarSelectText: { color: Colors.textSecondary, fontSize: 13, fontWeight: '600' },
  btnGhost: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 9, paddingVertical: 7, paddingHorizontal: 12 },
  btnGhostText: { color: Colors.textSecondary, fontSize: 12.5, fontWeight: '600' },

  checkbox: { width: 16, height: 16, borderRadius: 5, borderWidth: 1.5, borderColor: Colors.outline, alignItems: 'center', justifyContent: 'center' },
  checkboxOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },

  tableWrap: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 16, overflow: 'hidden' },
  // The ScrollView's own child (its scroll content) has to claim the full
  // table width itself — a plain <View> with no intrinsic width collapses
  // to whatever its children's flex-basis happens to negotiate, which on
  // web squeezed every column past Merchant into a single overlapping
  // cluster instead of scrolling. minWidth here is the sum of every
  // th*/td* column width below (40+70+340+110+260).
  // 820 (column widths) + 4×16 (inter-column gaps) + 2×14 (row padding).
  tableContent: { minWidth: 912 },
  // An explicit number, not '100%' — inside a horizontal ScrollView the
  // content container sizes itself TO its children, so a percentage width
  // here has nothing concrete to resolve against and collapses right back
  // to the same overlap this exists to fix.
  tableInner: { width: 912 },
  // gap, not per-cell padding — the fixed widths below reserve exactly one
  // column's worth of space each; without a gap, a right-aligned amount and
  // a left-aligned category pill sit flush against each other with zero
  // visual breathing room even though neither cell is actually miscomputed.
  theadRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: Colors.border, paddingVertical: 10, paddingHorizontal: 14, gap: 16 },
  th: { color: Colors.textMuted, fontSize: 10.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  // flexShrink: 0 on every fixed-width cell below, thead and row alike —
  // without it, a numeric `width` in a flex row is only a size HINT
  // (flex-basis), not a floor. The row's total intrinsic width (820) is
  // wider than some viewports before the ScrollView's own horizontal
  // scroll kicks in, and the default flexShrink: 1 was compressing every
  // cell's *reserved empty space* toward zero — text content stayed full
  // size (it has its own minimum), so columns visually collided with no
  // gap between them, which is exactly what shipped without this line.
  thChk: { width: 40, flexShrink: 0 },
  thDate: { width: 70, flexShrink: 0 },
  thName: { width: 340, flexShrink: 0 },
  thAmount: { width: 110, textAlign: 'right' as any, flexShrink: 0 },
  thCat: { width: 260, flexShrink: 0 },

  row: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: Colors.border, paddingVertical: 11, paddingHorizontal: 14, gap: 16, alignItems: 'flex-start' },
  rowMuted: { opacity: 0.55 },
  chkCell: { width: 40, flexShrink: 0, paddingTop: 2 },
  dateCell: { width: 70, flexShrink: 0, color: Colors.textSecondary, fontSize: 12.5, paddingTop: 2 },
  nameCell: { width: 340, flexShrink: 0, paddingRight: 10 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' as any },
  nameInput: { color: Colors.text, fontSize: 13.5, fontWeight: '600', padding: 0, minWidth: 60 },
  rawText: { color: Colors.textMuted, fontSize: 11.5, marginTop: 2 },
  dupNote: { color: Colors.textMuted, fontSize: 11, marginTop: 2 },
  amountCell: { width: 110, flexShrink: 0, textAlign: 'right' as any, color: Colors.text, fontSize: 13.5, fontWeight: '700', paddingTop: 2 },
  amountCredit: { color: Colors.textSecondary, fontWeight: '600' },

  catCell: { width: 260, flexShrink: 0, gap: 4 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 4, paddingHorizontal: 9, borderRadius: 999, alignSelf: 'flex-start' },
  swatch: { width: 6, height: 6, borderRadius: 4 },
  pillText: { fontSize: 11.5, fontWeight: '700' },
  pillSep: { fontSize: 11, opacity: 0.5 },
  pillSub: { fontSize: 11.5, fontWeight: '600', opacity: 0.8 },
  detailLine: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 2 },
  detailText: { color: Colors.textMuted, fontSize: 10.5 },

  chip: { fontSize: 9.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3, paddingVertical: 2, paddingHorizontal: 6, borderRadius: 5, overflow: 'hidden' },
  chipDup: { backgroundColor: '#FFD9661A', color: '#FFD966' },
  chipCredit: { backgroundColor: Colors.surfaceContainerHigh, color: Colors.textMuted },
  chipRefund: { backgroundColor: Colors.primary + '1A', color: Colors.primary },

  sectionRow: { paddingVertical: 9, paddingHorizontal: 14, backgroundColor: Colors.surface },
  sectionText: { color: Colors.textMuted, fontSize: 12, fontWeight: '700' },
  caret: { color: Colors.outline },

  footNote: { color: Colors.outline, fontSize: 11.5, marginTop: 10 },
  footerPad: { height: 24 },

  footer: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    borderTopWidth: 1, borderTopColor: Colors.border,
    paddingVertical: 16,
  },
  footerSummary: { flexDirection: 'column' },
  footerHeadline: { color: Colors.text, fontSize: 15, fontWeight: '800' },
  footerAmt: { color: Colors.primary },
  footerSub: { color: Colors.textMuted, fontSize: 11.5, marginTop: 2 },
  footerSpacer: { flex: 1 },
  btnCancel: { borderWidth: 1, borderColor: Colors.border, borderRadius: 11, paddingVertical: 11, paddingHorizontal: 18 },
  btnCancelText: { color: Colors.textSecondary, fontSize: 13, fontWeight: '700' },
  btnPrimary: { backgroundColor: Colors.primary, borderRadius: 11, paddingVertical: 12, paddingHorizontal: 20 },
  btnPrimaryDisabled: { opacity: 0.5 },
  btnPrimaryText: { color: Colors.onPrimary, fontSize: 13.5, fontWeight: '800' },
});
