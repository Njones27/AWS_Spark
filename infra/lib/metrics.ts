// Names shared between the stack that emits a custom metric and the Ops stack that alarms on it.

/** Custom metric namespace for a stage, e.g. `Spark/Dev`. */
export function stageNamespace(projectName: string, stage: string): string {
    return `${projectName}/${stage}`;
}

/** Count of error-level log lines from the API Lambda (metric filter in the Api stack). */
export const API_LOGGED_ERRORS_METRIC = 'ApiLoggedErrors';

/**
 * Count of `POST /api/profiles/recover` answers that found no profile (404), from the API access logs. A burst means
 * someone is guessing Builder Keys (the Api stack's metric filter, alarmed on in the Ops stack).
 */
export const RECOVER_MISSES_METRIC = 'RecoverMisses';

/** Count of requests API Gateway throttled (429), from the API access logs: someone may be using up the shared limits. */
export const API_THROTTLED_METRIC = 'ApiThrottled';

/**
 * The SSM parameter (one per AWS account) holding the email that the Ops stack's alarms go to:
 * `<Project>-Account-AlertEmail`, e.g. `Spark-Account-AlertEmail`. script/setup_initial.sh writes it from the account's
 * own email, so no address is ever committed to this public repo.
 */
export const alertEmailPrefix = (projectName: string): string => `${projectName}-Account`;
export const ALERT_EMAIL_KEY = 'AlertEmail';
