// Names shared between the stack that emits a custom metric and the Ops stack that alarms on it.

/** Custom metric namespace for a stage, e.g. `Spark/Dev`. */
export function stageNamespace(projectName: string, stage: string): string {
    return `${projectName}/${stage}`;
}

/** Count of error-level log lines from the API Lambda (metric filter in the Api stack). */
export const API_LOGGED_ERRORS_METRIC = 'ApiLoggedErrors';
