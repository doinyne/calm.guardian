import { View } from 'react-native';

import { MonoLabel } from '@/components/mono-label';

import { useCalmStatus } from './use-calm';

/**
 * A small "Calm Mode on" readout in pink, the colour of hope, so the user can see at a glance on
 * every screen that they're protected. Nothing while Calm Mode is off.
 */
export function CalmModeIndicator() {
  const { data } = useCalmStatus();
  const calmAccounts = data?.filter((account) => account.calm !== null).length ?? 0;
  if (calmAccounts === 0) return null;

  return (
    <View
      className="rounded-full border border-hope px-3 py-1"
      accessible
      aria-label={`Calm Mode is on for ${calmAccounts === 1 ? '1 account' : `${calmAccounts} accounts`}`}
    >
      <MonoLabel className="text-hope">Calm Mode · On</MonoLabel>
    </View>
  );
}
