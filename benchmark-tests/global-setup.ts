import { clearBellResults } from './helpers/bell-results';
import { clearThresholdResults } from './helpers/threshold-results';

export default function globalSetup(): void {
  clearThresholdResults();
  clearBellResults();
}
