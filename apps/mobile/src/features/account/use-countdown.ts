import { useEffect, useState } from 'react';

/** Counts down once a second from `fromSeconds`. `restart` starts it again. */
export function useCountdown(fromSeconds: number) {
  const [secondsLeft, setSecondsLeft] = useState(fromSeconds);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const tick = setTimeout(() => setSecondsLeft((seconds) => seconds - 1), 1000);
    return () => clearTimeout(tick);
  }, [secondsLeft]);

  return { secondsLeft, restart: () => setSecondsLeft(fromSeconds) };
}
