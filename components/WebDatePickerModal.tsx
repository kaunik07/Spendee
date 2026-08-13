// @react-native-community/datetimepicker has no web implementation (no
// `.web` entry point in the package), so every Android/iOS DateTimePicker
// usage in the app needs a third, web-only branch. This is that branch,
// shared across all call sites: a centered modal card wrapping the
// already-themed react-native-calendars Calendar (same lib used in the
// Summary tab, so it matches the app's existing calendar look).
import { Modal, Pressable, StyleSheet } from 'react-native';
import { Calendar } from 'react-native-calendars';
import { Colors } from '@/constants/theme';

interface Props {
  visible: boolean;
  date: string;       // YYYY-MM-DD — currently selected date / month to open on
  maxDate?: string;    // YYYY-MM-DD
  onSelect: (dateStr: string) => void;
  onClose: () => void;
}

export default function WebDatePickerModal({ visible, date, maxDate, onSelect, onClose }: Props) {
  if (!visible) return null;
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => {}}>
          <Calendar
            current={date}
            maxDate={maxDate}
            onDayPress={(day: { dateString: string }) => onSelect(day.dateString)}
            markedDates={{ [date]: { selected: true, selectedColor: Colors.primary, selectedTextColor: Colors.onPrimary } }}
            theme={{
              backgroundColor: Colors.surfaceContainerHigh,
              calendarBackground: Colors.surfaceContainerHigh,
              textSectionTitleColor: Colors.textSecondary,
              selectedDayBackgroundColor: Colors.primary,
              selectedDayTextColor: Colors.onPrimary,
              todayTextColor: Colors.primary,
              dayTextColor: Colors.text,
              textDisabledColor: Colors.outline,
              arrowColor: Colors.primary,
              monthTextColor: Colors.text,
              textDayFontWeight: '500',
              textMonthFontWeight: '700',
              textDayHeaderFontWeight: '600',
            }}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    backgroundColor: Colors.surfaceContainerHigh,
    borderRadius: 20,
    padding: 12,
    width: '90%',
    maxWidth: 360,
  },
});
