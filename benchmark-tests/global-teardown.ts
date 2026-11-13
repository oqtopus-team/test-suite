import { aggregateBellResults } from './helpers/bell-results';
import { aggregateThresholdResults } from './helpers/threshold-results';

export default function globalTeardown(): void {
  aggregateThresholdResults();
  aggregateBellResults();
}
