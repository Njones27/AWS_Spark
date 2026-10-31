import { MAX_COMPLETED, type ProgressState } from './validate';

/**
 * The merge rule for `PUT /api/profiles/me` (docs/aws/CONTRACT.md): a finished level is never lost, so `completed` is
 * the union with the stored levels first, without repeats. Everything else is the incoming value.
 * The union is capped at the schema's 500 levels (stored ones kept first) so the stored state always stays valid;
 * Spark has far fewer levels than that.
 */
export function mergeState(stored: ProgressState, incoming: ProgressState): ProgressState {
  return {
    band: incoming.band,
    completed: [...new Set([...stored.completed, ...incoming.completed])].slice(0, MAX_COMPLETED),
    playground: incoming.playground,
    unlockAll: incoming.unlockAll,
  };
}
