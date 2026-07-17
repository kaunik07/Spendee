import { MaterialCommunityIcons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import React, { useMemo, useRef, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  CategoryDetailFields,
  DetailField,
  getSubcategories,
  getSubcategoryById,
} from '@/constants/subcategories';
import { searchAirlines, AirlineHit } from '@/lib/airlines';
import { searchAirports, AirportHit } from '@/lib/airports';

const C = {
  bg:      '#1C1B23',
  surface: '#252336',
  primary: '#A8EDBB',
  onPrim:  '#003919',
  text:    '#E6E1E5',
  textSec: '#CAC4D0',
  outline: '#938F99',
  border:  '#2E2C3B',
};

interface Props {
  category: string;
  subcategory: string | null;
  details: Record<string, any>;
  onChangeSubcategory: (id: string | null) => void;
  onChangeDetails: (d: Record<string, any>) => void;
  /** Store names learned from past expenses (groceries autocomplete) */
  knownStores?: string[];
  /** Past values per detail key (e.g. { restaurant: [...] }) for 'suggest-text' fields */
  learned?: Record<string, string[]>;
}

export default function SubcategorySection({
  category, subcategory, details, onChangeSubcategory, onChangeDetails, knownStores = [], learned = {},
}: Props) {
  const subs = getSubcategories(category);
  const sub  = getSubcategoryById(category, subcategory);

  // Fields: subcategory-level first, then category-level extras (e.g. groceries store)
  const fields: DetailField[] = [
    ...(sub?.fields ?? []),
    ...(CategoryDetailFields[category] ?? []),
  ];

  const setDetail = (key: string, value: any) => {
    const next: Record<string, any> = { ...details, [key]: value };
    // Unchecking a checkbox wipes the fields it controls
    const def = fields.find((f) => f.key === key);
    if (def?.type === 'checkbox' && !value && def.clears) {
      def.clears.forEach((k) => { delete next[k]; });
    }
    onChangeDetails(next);
  };

  if (subs.length === 0 && !(CategoryDetailFields[category]?.length)) return null;

  return (
    <View>
      {/* Subcategory chips */}
      {subs.length > 0 && (
        <>
          <Text style={styles.fieldLabel}>
            Subcategory <Text style={styles.optional}>(optional)</Text>
          </Text>
          <View style={styles.chipsWrap}>
            {subs.map((s) => {
              const selected = subcategory === s.id;
              return (
                <TouchableOpacity
                  key={s.id}
                  style={[styles.chip, selected && styles.chipSelected]}
                  onPress={() => {
                    // Changing subcategory resets its detail values
                    onChangeSubcategory(selected ? null : s.id);
                    onChangeDetails({});
                  }}
                  activeOpacity={0.75}>
                  <MaterialCommunityIcons name={s.icon as any} size={14} color={selected ? C.primary : C.outline} />
                  <Text style={[styles.chipText, selected && { color: C.primary }]}>{s.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </>
      )}

      {/* Detail fields */}
      {fields
        .filter((f) => !f.showIf || f.showIf(details))
        .map((f) => (
          <FieldRenderer
            key={`${sub?.id ?? category}_${f.key}`}
            field={f}
            value={details[f.key]}
            onChange={(v) => setDetail(f.key, v)}
            knownStores={knownStores}
            learnedValues={learned[f.key] ?? []}
          />
        ))}
    </View>
  );
}

// ── Individual field renderers ───────────────────────────
function FieldRenderer({
  field, value, onChange, knownStores, learnedValues,
}: {
  field: DetailField;
  value: any;
  onChange: (v: any) => void;
  knownStores: string[];
  learnedValues: string[];
}) {
  switch (field.type) {
    case 'suggest-text': return <SuggestTextField field={field} value={value} onChange={onChange} suggestions={learnedValues} />;
    case 'chips':    return <ChipsField field={field} value={value} onChange={onChange} />;
    case 'date':     return <DateField field={field} value={value} onChange={onChange} />;
    case 'datetime': return <DateTimeField field={field} value={value} onChange={onChange} />;
    case 'airport':  return <AirportField field={field} value={value} onChange={onChange} />;
    case 'airline':  return <AirlineField field={field} value={value} onChange={onChange} />;
    case 'search-list': return <SearchListField field={field} value={value} onChange={onChange} />;
    case 'checkbox': return <CheckboxField field={field} value={value} onChange={onChange} />;
    case 'location': return <LocationField field={field} value={value} onChange={onChange} />;
    case 'store':    return <StoreField field={field} value={value} onChange={onChange} knownStores={knownStores} />;
    default:         return <TextField field={field} value={value} onChange={onChange} />;
  }
}

function FieldLabel({ text }: { text: string }) {
  return <Text style={styles.detailLabel}>{text}</Text>;
}

function TextField({ field, value, onChange }: { field: DetailField; value: any; onChange: (v: any) => void }) {
  return (
    <View>
      <FieldLabel text={field.label} />
      <TextInput
        style={styles.input}
        placeholder={field.placeholder ?? field.label}
        placeholderTextColor={C.outline}
        value={value ?? ''}
        onChangeText={onChange}
        maxLength={80}
        selectionColor={C.primary}
      />
    </View>
  );
}

function ChipsField({ field, value, onChange }: { field: DetailField; value: any; onChange: (v: any) => void }) {
  return (
    <View>
      <FieldLabel text={field.label} />
      <View style={styles.chipsWrap}>
        {(field.options ?? []).map((opt) => {
          const selected = value === opt;
          return (
            <TouchableOpacity
              key={opt}
              style={[styles.chip, selected && styles.chipSelected]}
              onPress={() => onChange(selected ? undefined : opt)}
              activeOpacity={0.75}>
              <Text style={[styles.chipText, selected && { color: C.primary }]}>{opt}</Text>
              {selected && <MaterialCommunityIcons name="check-circle" size={13} color={C.primary} />}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function StoreField({
  field, value, onChange, knownStores,
}: {
  field: DetailField; value: any; onChange: (v: any) => void; knownStores: string[];
}) {
  const options = useMemo(() => {
    const seen = new Set<string>();
    return [...(field.options ?? []), ...knownStores].filter((s) => {
      const k = s.trim().toLowerCase();
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }, [field.options, knownStores]);

  return (
    <View>
      <FieldLabel text={field.label} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow} keyboardShouldPersistTaps="handled">
        {options.map((opt) => {
          const selected = value === opt;
          return (
            <TouchableOpacity
              key={opt}
              style={[styles.chip, selected && styles.chipSelected]}
              onPress={() => onChange(selected ? undefined : opt)}
              activeOpacity={0.75}>
              <Text style={[styles.chipText, selected && { color: C.primary }]}>{opt}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      <TextInput
        style={styles.input}
        placeholder="Or type another store..."
        placeholderTextColor={C.outline}
        value={options.includes(value) ? '' : (value ?? '')}
        onChangeText={onChange}
        maxLength={60}
        selectionColor={C.primary}
      />
    </View>
  );
}

function DateField({ field, value, onChange }: { field: DetailField; value: any; onChange: (v: any) => void }) {
  const [show, setShow] = useState(false);
  const dateObj = value ? new Date(value + 'T00:00:00') : new Date();

  return (
    <View>
      <FieldLabel text={field.label} />
      <Pressable style={styles.dateRow} onPress={() => setShow(true)}>
        <MaterialCommunityIcons name="calendar-outline" size={15} color={C.primary} />
        <Text style={[styles.dateText, !value && { color: C.outline }]}>
          {value
            ? dateObj.toLocaleDateString('default', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' })
            : 'Pick a date'}
        </Text>
        {value ? (
          <Pressable onPress={() => onChange(undefined)} hitSlop={8}>
            <MaterialCommunityIcons name="close-circle" size={15} color={C.outline} />
          </Pressable>
        ) : null}
      </Pressable>

      {show && Platform.OS === 'android' && (
        <DateTimePicker
          value={dateObj}
          mode="date"
          display="default"
          onChange={(_, sel) => {
            setShow(false);
            if (sel) onChange(sel.toISOString().split('T')[0]);
          }}
        />
      )}
      {show && Platform.OS === 'ios' && (
        <Modal transparent animationType="fade" onRequestClose={() => setShow(false)}>
          <Pressable style={styles.modalOverlay} onPress={() => setShow(false)}>
            <Pressable style={styles.datePickerCard} onPress={() => {}}>
              <DateTimePicker
                value={dateObj}
                mode="date"
                display="spinner"
                textColor={C.text}
                onChange={(_, sel) => { if (sel) onChange(sel.toISOString().split('T')[0]); }}
                style={{ width: '100%' }}
              />
              <TouchableOpacity style={styles.datePickerDone} onPress={() => setShow(false)}>
                <Text style={styles.datePickerDoneText}>Done</Text>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </View>
  );
}

// Free text with autocomplete from values the user saved before
function SuggestTextField({
  field, value, onChange, suggestions,
}: {
  field: DetailField; value: any; onChange: (v: any) => void; suggestions: string[];
}) {
  const [hits, setHits] = useState<string[]>([]);

  const handleChange = (t: string) => {
    onChange(t);
    const q = t.trim().toLowerCase();
    if (q.length < 1) { setHits([]); return; }
    const matches = suggestions
      .filter((s) => s.toLowerCase().includes(q) && s.toLowerCase() !== q)
      .sort((a, b) => {
        const aStarts = a.toLowerCase().startsWith(q) ? 0 : 1;
        const bStarts = b.toLowerCase().startsWith(q) ? 0 : 1;
        return aStarts - bStarts || a.localeCompare(b);
      })
      .slice(0, 5);
    setHits(matches);
  };

  return (
    <View>
      <FieldLabel text={field.label} />
      <TextInput
        style={styles.input}
        placeholder={field.placeholder ?? field.label}
        placeholderTextColor={C.outline}
        value={value ?? ''}
        onChangeText={handleChange}
        maxLength={80}
        selectionColor={C.primary}
      />
      {hits.length > 0 && (
        <View style={styles.suggestBox}>
          {hits.map((s) => (
            <TouchableOpacity
              key={s}
              style={styles.suggestRow}
              onPress={() => { onChange(s); setHits([]); }}
              activeOpacity={0.7}>
              <MaterialCommunityIcons name="history" size={15} color={C.outline} />
              <Text style={[styles.suggestText, { color: C.text }]} numberOfLines={1}>{s}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

function CheckboxField({ field, value, onChange }: { field: DetailField; value: any; onChange: (v: any) => void }) {
  const checked = !!value;
  return (
    <Pressable style={styles.checkboxRow} onPress={() => onChange(!checked)}>
      <MaterialCommunityIcons
        name={checked ? 'checkbox-marked' : 'checkbox-blank-outline'}
        size={20}
        color={checked ? C.primary : C.outline}
      />
      <Text style={[styles.checkboxLabel, checked && { color: C.text }]}>{field.label}</Text>
    </Pressable>
  );
}

// Local "YYYY-MM-DDTHH:mm" — avoids UTC shifts from toISOString()
function toLocalDateTimeString(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function DateTimeField({ field, value, onChange }: { field: DetailField; value: any; onChange: (v: any) => void }) {
  const [showIOS, setShowIOS]         = useState(false);
  const [androidStep, setAndroidStep] = useState<null | 'date' | 'time'>(null);
  const [pendingDate, setPendingDate] = useState<Date | null>(null);

  const dateObj = value ? new Date(value) : new Date();

  const formatted = value
    ? `${dateObj.toLocaleDateString('default', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })} · ${dateObj.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
    : 'Pick date & time';

  const open = () => {
    if (Platform.OS === 'ios') setShowIOS(true);
    else setAndroidStep('date');
  };

  return (
    <View>
      <FieldLabel text={field.label} />
      <Pressable style={styles.dateRow} onPress={open}>
        <MaterialCommunityIcons name="clock-outline" size={15} color={C.primary} />
        <Text style={[styles.dateText, !value && { color: C.outline }]}>{formatted}</Text>
        {value ? (
          <Pressable onPress={() => onChange(undefined)} hitSlop={8}>
            <MaterialCommunityIcons name="close-circle" size={15} color={C.outline} />
          </Pressable>
        ) : null}
      </Pressable>

      {/* Android: two-step — date, then time */}
      {androidStep === 'date' && Platform.OS === 'android' && (
        <DateTimePicker
          value={dateObj}
          mode="date"
          display="default"
          onChange={(event, sel) => {
            if (event.type !== 'set' || !sel) { setAndroidStep(null); return; }
            setPendingDate(sel);
            setAndroidStep('time');
          }}
        />
      )}
      {androidStep === 'time' && Platform.OS === 'android' && (
        <DateTimePicker
          value={pendingDate ?? dateObj}
          mode="time"
          display="default"
          onChange={(event, sel) => {
            setAndroidStep(null);
            if (event.type !== 'set' || !sel || !pendingDate) return;
            const combined = new Date(pendingDate);
            combined.setHours(sel.getHours(), sel.getMinutes(), 0, 0);
            onChange(toLocalDateTimeString(combined));
            setPendingDate(null);
          }}
        />
      )}

      {/* iOS: combined datetime spinner */}
      {showIOS && Platform.OS === 'ios' && (
        <Modal transparent animationType="fade" onRequestClose={() => setShowIOS(false)}>
          <Pressable style={styles.modalOverlay} onPress={() => setShowIOS(false)}>
            <Pressable style={styles.datePickerCard} onPress={() => {}}>
              <DateTimePicker
                value={dateObj}
                mode="datetime"
                display="spinner"
                textColor={C.text}
                onChange={(_, sel) => { if (sel) onChange(toLocalDateTimeString(sel)); }}
                style={{ width: '100%' }}
              />
              <TouchableOpacity style={styles.datePickerDone} onPress={() => setShowIOS(false)}>
                <Text style={styles.datePickerDoneText}>Done</Text>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </View>
  );
}

function AirportField({ field, value, onChange }: { field: DetailField; value: any; onChange: (v: any) => void }) {
  const [hits, setHits] = useState<AirportHit[]>([]);

  const handleChange = (t: string) => {
    onChange(t);
    setHits(t.trim().length >= 2 ? searchAirports(t) : []);
  };

  return (
    <View>
      <FieldLabel text={field.label} />
      <TextInput
        style={styles.input}
        placeholder={field.placeholder ?? 'Search airport...'}
        placeholderTextColor={C.outline}
        value={value ?? ''}
        onChangeText={handleChange}
        autoCapitalize="characters"
        maxLength={80}
        selectionColor={C.primary}
      />
      {hits.length > 0 && (
        <View style={styles.suggestBox}>
          {hits.map((h) => (
            <TouchableOpacity
              key={h.iata + h.name}
              style={styles.suggestRow}
              onPress={() => { onChange(h.display); setHits([]); }}
              activeOpacity={0.7}>
              <Text style={styles.suggestCode}>{h.iata}</Text>
              <Text style={styles.suggestText} numberOfLines={1}>
                {h.name}{h.city ? ` · ${h.city}, ${h.country}` : ''}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

function AirlineField({ field, value, onChange }: { field: DetailField; value: any; onChange: (v: any) => void }) {
  const [hits, setHits]       = useState<AirlineHit[]>([]);
  const [showOther, setShowOther] = useState(false);

  const handleChange = (t: string) => {
    onChange(t);
    const trimmed = t.trim();
    if (trimmed.length < 2) {
      setHits([]);
      setShowOther(false);
      return;
    }
    const results = searchAirlines(trimmed);
    setHits(results);
    // Offer "use as typed" unless what they typed exactly matches a listed airline
    setShowOther(!results.some((h) => h.name.toLowerCase() === trimmed.toLowerCase()));
  };

  const pick = (v: string) => {
    onChange(v);
    setHits([]);
    setShowOther(false);
  };

  return (
    <View>
      <FieldLabel text={field.label} />
      <TextInput
        style={styles.input}
        placeholder={field.placeholder ?? 'Search airline...'}
        placeholderTextColor={C.outline}
        value={value ?? ''}
        onChangeText={handleChange}
        maxLength={60}
        selectionColor={C.primary}
      />
      {(hits.length > 0 || showOther) && (
        <View style={styles.suggestBox}>
          {hits.map((h) => (
            <TouchableOpacity
              key={h.iata + h.name}
              style={styles.suggestRow}
              onPress={() => pick(h.name)}
              activeOpacity={0.7}>
              <Text style={styles.suggestCode}>{h.iata}</Text>
              <Text style={styles.suggestText} numberOfLines={1}>
                <Text style={{ color: C.text }}>{h.name}</Text>{h.country ? ` · ${h.country}` : ''}
              </Text>
            </TouchableOpacity>
          ))}
          {showOther && (value ?? '').trim().length >= 2 && (
            <TouchableOpacity
              style={styles.suggestRow}
              onPress={() => pick((value ?? '').trim())}
              activeOpacity={0.7}>
              <MaterialCommunityIcons name="plus-circle-outline" size={15} color={C.primary} />
              <Text style={styles.suggestText} numberOfLines={1}>
                Other — use “<Text style={{ color: C.primary }}>{(value ?? '').trim()}</Text>”
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

// Searchable dropdown over a fixed options list, with an
// "Other — use as typed" fallback (mirrors the airline field UX).
function SearchListField({ field, value, onChange }: { field: DetailField; value: any; onChange: (v: any) => void }) {
  const [hits, setHits]           = useState<string[]>([]);
  const [showOther, setShowOther] = useState(false);

  const handleChange = (t: string) => {
    onChange(t);
    const q = t.trim().toLowerCase();
    if (q.length < 1) {
      setHits([]);
      setShowOther(false);
      return;
    }
    const results = (field.options ?? []).filter((o) => o.toLowerCase().includes(q)).slice(0, 6);
    setHits(results);
    setShowOther(!results.some((o) => o.toLowerCase() === q));
  };

  const pick = (v: string) => {
    onChange(v);
    setHits([]);
    setShowOther(false);
  };

  return (
    <View>
      <FieldLabel text={field.label} />
      <TextInput
        style={styles.input}
        placeholder={field.placeholder ?? field.label}
        placeholderTextColor={C.outline}
        value={value ?? ''}
        onChangeText={handleChange}
        maxLength={60}
        selectionColor={C.primary}
      />
      {(hits.length > 0 || showOther) && (
        <View style={styles.suggestBox}>
          {hits.map((opt) => (
            <TouchableOpacity
              key={opt}
              style={styles.suggestRow}
              onPress={() => pick(opt)}
              activeOpacity={0.7}>
              <MaterialCommunityIcons name="check-circle-outline" size={15} color={C.outline} />
              <Text style={[styles.suggestText, { color: C.text }]} numberOfLines={1}>{opt}</Text>
            </TouchableOpacity>
          ))}
          {showOther && (value ?? '').trim().length >= 2 && (
            <TouchableOpacity
              style={styles.suggestRow}
              onPress={() => pick((value ?? '').trim())}
              activeOpacity={0.7}>
              <MaterialCommunityIcons name="plus-circle-outline" size={15} color={C.primary} />
              <Text style={styles.suggestText} numberOfLines={1}>
                Other — use “<Text style={{ color: C.primary }}>{(value ?? '').trim()}</Text>”
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

function LocationField({ field, value, onChange }: { field: DetailField; value: any; onChange: (v: any) => void }) {
  const [hits, setHits] = useState<{ label: string; sub: string }[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = (t: string) => {
    onChange(t);
    if (timer.current) clearTimeout(timer.current);
    if (t.trim().length < 3) { setHits([]); return; }
    timer.current = setTimeout(async () => {
      try {
        // Photon — open-source OpenStreetMap geocoder, no API key required
        const res = await fetch(
          `https://photon.komoot.io/api/?q=${encodeURIComponent(t.trim())}&limit=5`,
          { headers: { Accept: 'application/json' } }
        );
        const json = await res.json();
        const seen = new Set<string>();
        const results = (json.features ?? [])
          .map((f: any) => {
            const p = f.properties ?? {};
            const label = p.name ?? '';
            const sub = [p.city ?? p.county, p.state, p.country].filter(Boolean).join(', ');
            return { label, sub };
          })
          .filter((r: { label: string; sub: string }) => {
            const k = `${r.label}|${r.sub}`;
            if (!r.label || seen.has(k)) return false;
            seen.add(k);
            return true;
          });
        setHits(results);
      } catch {
        setHits([]); // offline / API down — free text still works
      }
    }, 400);
  };

  return (
    <View>
      <FieldLabel text={field.label} />
      <TextInput
        style={styles.input}
        placeholder={field.placeholder ?? 'Search a place...'}
        placeholderTextColor={C.outline}
        value={value ?? ''}
        onChangeText={handleChange}
        maxLength={100}
        selectionColor={C.primary}
      />
      {hits.length > 0 && (
        <View style={styles.suggestBox}>
          {hits.map((h, i) => (
            <TouchableOpacity
              key={`${h.label}_${i}`}
              style={styles.suggestRow}
              onPress={() => { onChange(h.sub ? `${h.label}, ${h.sub}` : h.label); setHits([]); }}
              activeOpacity={0.7}>
              <MaterialCommunityIcons name="map-marker-outline" size={15} color={C.outline} />
              <Text style={styles.suggestText} numberOfLines={1}>
                <Text style={{ color: C.text }}>{h.label}</Text>{h.sub ? ` · ${h.sub}` : ''}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fieldLabel: {
    color: C.textSec,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginTop: 4,
  },
  optional: { color: C.outline, textTransform: 'none', fontWeight: '400' },

  detailLabel: {
    color: C.outline,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginTop: 2,
  },

  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  chipsRow:  { gap: 8, paddingBottom: 10, paddingRight: 4 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: C.surface,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: C.border,
  },
  chipSelected: { borderColor: C.primary + '80', backgroundColor: C.primary + '12' },
  chipText:     { color: C.textSec, fontSize: 13, fontWeight: '600' },

  input: {
    backgroundColor: C.surface,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 13,
    color: C.text,
    fontSize: 15,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 14,
  },

  suggestBox: {
    backgroundColor: C.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    marginTop: -8,
    marginBottom: 14,
    overflow: 'hidden',
  },
  suggestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  suggestCode: { color: C.primary, fontSize: 13, fontWeight: '800', width: 36 },
  suggestText: { color: C.textSec, fontSize: 13, flex: 1 },

  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 4,
    marginBottom: 14,
  },
  checkboxLabel: { color: C.textSec, fontSize: 14, fontWeight: '600' },

  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: C.surface,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 14,
  },
  dateText: { color: C.text, fontSize: 14, flex: 1 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  datePickerCard: {
    backgroundColor: C.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 32,
    paddingTop: 16,
    paddingHorizontal: 16,
  },
  datePickerDone: {
    alignSelf: 'flex-end',
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: C.primary,
    borderRadius: 12,
    marginTop: 8,
  },
  datePickerDoneText: { color: C.onPrim, fontWeight: '700', fontSize: 15 },
});
