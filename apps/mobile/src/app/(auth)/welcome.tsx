import { showsDiagnostics } from '@/config/env';
import { ApiStatus } from '@/features/diagnostics/api-status';
import { WelcomeScreen } from '@/features/welcome/welcome-screen';

export default function WelcomeRoute() {
  return <WelcomeScreen diagnostics={showsDiagnostics ? <ApiStatus /> : null} />;
}
