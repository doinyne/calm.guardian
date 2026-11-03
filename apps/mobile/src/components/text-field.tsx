import type { ComponentProps } from 'react';
import { View } from 'react-native';

import { ErrorMessage } from '@/components/error-message';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type TextFieldProps = ComponentProps<typeof Input> & {
  label: string;
  error?: string | null;
};

/** A labelled input with its error underneath. The label is also the input's accessible name. */
export function TextField({ label, error, ...inputProps }: TextFieldProps) {
  return (
    <View className="gap-2">
      <Label className="text-base">{label}</Label>
      <Input aria-label={label} aria-invalid={Boolean(error)} {...inputProps} />
      {error ? <ErrorMessage>{error}</ErrorMessage> : null}
    </View>
  );
}
