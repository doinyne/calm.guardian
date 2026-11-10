import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { Platform, View } from 'react-native';

import { MonoLabel } from '@/components/mono-label';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';

const DISPLAY = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

/**
 * A labelled date and time. iOS shows its compact picker inline; Android has no combined picker, so
 * a button opens the date, then the time.
 */
export function DateTimeField({
  label,
  value,
  maximumDate,
  onChange,
}: {
  label: string;
  value: Date;
  maximumDate: Date;
  onChange: (value: Date) => void;
}) {
  const changed = (_event: DateTimePickerEvent, picked?: Date) => {
    if (picked) onChange(picked);
  };

  const openOnAndroid = () =>
    DateTimePickerAndroid.open({
      value,
      mode: 'date',
      maximumDate,
      onChange: (event, date) => {
        if (event.type !== 'set' || !date) return;
        DateTimePickerAndroid.open({ value: date, mode: 'time', onChange: changed });
      },
    });

  return (
    <View className="flex-row items-center justify-between gap-3">
      <MonoLabel>{label}</MonoLabel>
      {Platform.OS === 'ios' ? (
        <DateTimePicker
          value={value}
          mode="datetime"
          display="compact"
          maximumDate={maximumDate}
          themeVariant="dark"
          accessibilityLabel={label}
          onChange={changed}
        />
      ) : (
        <Button
          variant="outline"
          onPress={openOnAndroid}
          aria-label={`${label}: ${DISPLAY.format(value)}`}
        >
          <Text>{DISPLAY.format(value)}</Text>
        </Button>
      )}
    </View>
  );
}
