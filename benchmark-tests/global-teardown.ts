import { aggregateThresholdResults } from './helpers/threshold-results';

export default function globalTeardown(): void {
  aggregateThresholdResults();
}
