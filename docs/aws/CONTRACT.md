# Spark backend contract (v1)

Shared by `infra/` (CDK), `backend/` (Lambda) and `src/` (frontend). Change this file first, then the code.
Architecture and rationale: see `docs/aws/architecture.html` and the approved plan.

## Transport

- Browser → CloudFront → `/api/*` behavior → API Gateway HTTP API (payload format 2.0) → one Lambda.
- Routes are registered in API Gateway **with** the `/api` prefix; CloudFront forwards the full path unchanged.
- Same origin: the frontend calls relative `/api/...`. No CORS configuration anywhere.
- CloudFront adds the custom origin header `x-origin-verify: <secret>` to every `/api/*` request. The Lambda compares it
  with env `ORIGIN_VERIFY_SECRET`. If the env value is non-empty and the header is missing or different → `403 forbidden`.
  Applies to every route, including `/api/health` (the smoke test goes through CloudFront).
- Lambda env vars: `TABLE_NAME`, `STAGE` (`dev` | `prod`), `APP_VERSION` (git sha or `local`), `ORIGIN_VERIFY_SECRET`, plus `NODE_OPTIONS=--enable-source-maps`.
- Handler: `backend/src/handler.ts` exports `handler` (type `APIGatewayProxyHandlerV2`). CDK `NodejsFunction` bundles it
  with esbuild, ESM output, `externalModules: ['@aws-sdk/*']`, Node 24, arm64.
- `src/data/services.ts` reads `import.meta.env.BASE_URL`; the CDK bundling defines `import.meta.env` as `{}` and
  `import.meta.env.BASE_URL` as `"/"` so frontend modules can be imported server-side.
- JSON in and out, `content-type: application/json; charset=utf-8`.
- Error body: `{ "error": "<code>", "message": "<short, kid-safe text>" }`.
  Codes: `bad_request` 400, `unauthorized` 401, `forbidden` 403, `not_found` 404, `payload_too_large` 413, `internal` 500.
  API Gateway emits its own 429 on throttling; the client treats 429 like a network failure (retry later).

## Routes

| Route | Auth | Request | Success |
|---|---|---|---|
| `GET /api/health` | none | – | `200 { ok: true, stage, version, time }` |
| `POST /api/profiles` | none | `{}` | `201 { profileId, token, builderKey, state, updatedAt }` |
| `GET /api/profiles/me` | bearer | – | `200 { profileId, state, updatedAt }` |
| `PUT /api/profiles/me` | bearer | `{ state: ProgressState }` | `200 { profileId, state, updatedAt }` (merged) |
| `POST /api/profiles/recover` | none | `{ builderKey }` | `200 { profileId, token, builderKey, state, updatedAt }` |
| `POST /api/shares` | none | `{ code }` | `201 { id }` |
| `GET /api/shares/{id}` | none | – | `200 { id, code }` |

- Unknown route or method → `404 not_found`. Bad token → `401 unauthorized`. Unknown builderKey → `404 not_found`.
- Request bodies over 64 KB → `413 payload_too_large`. `code` over 16 KB → `413`.
- `POST /api/shares` rejects a `code` that `decodeDesign(code)` (from `src/engine/share.ts`) turns into `null` → `400 bad_request`.

## Types

```ts
// Band comes from src/data/types.ts
interface ProgressState {
  band: Band | null;
  completed: string[];      // level ids, <= 500 entries, each <= 32 chars matching /^[a-z0-9-]+$/
  playground: string | null; // a share code from encodeDesign(); server accepts only if decodeDesign(code) !== null; <= 16 KB
  unlockAll: boolean;
}
```

Closed schema: any unknown field anywhere in the body → `400 bad_request`. Wrong types → `400`.

## Identity

- `token`: 32 random bytes, base64url (43 chars). Sent as `Authorization: Bearer <token>`. Server stores only `sha256(token)` hex.
- `builderKey`: `WORD-WORD-DDDD`, e.g. `MAPLE-OTTER-4821`. Two distinct words from a 1,000-entry kid-safe list
  (animals, plants, colours, weather, food, everyday objects; uppercase A–Z, 3–7 letters, nothing scary or rude), then
  four digits `0000`–`9999`. Server normalises input: trim, uppercase, treat spaces and underscores as `-`, collapse repeats.
  Server stores only `sha256(normalisedKey)` hex.
- `recover` adds a token to the profile without signing other devices out. A profile holds at most 8 tokens; a ninth
  evicts the oldest (its `TOKEN#` item is deleted and it gets `401` from then on). Two devices on one Builder Key therefore
  both stay signed in. A malformed key → `400 bad_request`; a well-formed key nobody has → `404 not_found`.
- Four-digit endings that read badly (containing 69, 420, 666, 911, 1312, 1488, 8008) are never issued; recovery still accepts any digits.
- Every response carries `cache-control: no-store`.
- `profileId`: `crypto.randomUUID()`.
- Share `id` is derived from the code so a replayed design costs no storage: SHA-256 of the code's UTF-8 bytes read as a
  big-endian integer N, then N mod 62^10 written as 10 base62 digits (alphabet `0-9A-Za-z`, most significant first,
  left-padded with `0`). `POST /api/shares` with a code already stored returns `201` with the same `id` and leaves
  `createdAt`/`ttl` untouched. If the id already holds a different code, the server retries with `<code>#1` then `<code>#2`
  (`#` never appears in a base64url code); if all three are taken it answers `500`. Test vectors: `"hello"` → `IbYLeK5ySK`,
  `"hello#1"` → `xa3mgaG2Dg`, `""` → `jWEepHLxI5`.

## Merge rule for `PUT /api/profiles/me`

- `completed` = union(stored.completed, request.completed), de-duplicated, stored order first.
- `band`, `playground`, `unlockAll` = request values.
- `updatedAt` = server time, ISO 8601. The response carries the merged state; the client replaces its local copy with it.

## DynamoDB

One table per stage, on-demand, partition key `pk` (S), sort key `sk` (S), TTL attribute `ttl` (N, epoch seconds).

| pk | sk | attributes |
|---|---|---|
| `PROFILE#<profileId>` | `META` | `tokens` (list of sha256 hex, oldest first, at most 8), `keyHash`, `state` (JSON string), `createdAt`, `updatedAt`, `ttl` = now + 2 years, pushed back on every profile write (PUT /me and recover) |
| `TOKEN#<tokenHash>` | `META` | `profileId`, `createdAt`, `ttl` = now + 2 years, set once (an expired token simply gets `401`; the client recovers with its saved key) |
| `KEY#<keyHash>` | `META` | `profileId`, `createdAt` (no ttl) |
| `SHARE#<id>` | `META` | `code`, `createdAt`, `ttl` = now + 2 years |

- Create writes `PROFILE#`, `KEY#` and the first `TOKEN#` in one transaction, each only if it does not exist (key collision → new key, retry).
- Recover updates `tokens` only if the list is unchanged since it was read, adds the new `TOKEN#`, and deletes the evicted one in the same transaction (retry up to 3 times on a race).
- Auth = `TOKEN#<hash>` lookup → `profileId`, then the hash must still be in that profile's `tokens`.
- DynamoDB `TransactionConflictException`, and transactions cancelled with a `TransactionConflict` reason, count as conflicts and go through the same re-read/merge/retry path (never a `500`).
- `PUT /api/profiles/me` is an optimistic write: if another device saved in between, the route re-reads, merges again and retries (up to 3 times), so a finished level is never lost. The merged `completed` list is capped at 500, stored entries first.

## SSM parameters

Names are `<Project>-<Stage>-<Key>`, e.g. `Spark-Dev-TableName` (the template's `putParameter`/`getParameter` prefixing).

| Key | Written by | Value |
|---|---|---|
| `TableName`, `TableArn` | Data stack | DynamoDB table |
| `ApiId`, `ApiDomain`, `FunctionName` | Api stack | `ApiDomain` = `<apiId>.execute-api.<region>.amazonaws.com`; `FunctionName` lets the Ops stack find the Lambda for alarms |
| `WebBucketName`, `DistributionId`, `DistributionDomain` | Web stack | CloudFront + S3; `DistributionDomain` is always the `*.cloudfront.net` name (the `SiteUrl` output switches to a custom domain) |
| `OriginVerifySecret` | `infra/script/setup_initial.sh` (plain `String`, 32 random bytes hex) | read by Api (Lambda env) and Web (origin header) |

## Config files (`infra/config/`)

Dev and prod live in separate AWS accounts, each with an account config and a stage config. A stage config and its
account config must name the same `Project.Account`, `Region` and `Profile` (`setup_initial.sh` checks this).

| File | `Project.Stage` | `Project.Account` | `Project.Profile` |
|---|---|---|---|
| `app-config-account-dev.json` | `Account` | `166147842278` | `spark-dev` |
| `app-config-dev.json` | `Dev` | `166147842278` | `spark-dev` |
| `app-config-account-prod.json` | `Account` | `027729116436` | `spark-prod` |
| `app-config-prod.json` | `Prod` | `027729116436` | `spark-prod` |

Every IAM role the app creates has a name starting with `Spark-` and carries the permissions boundary
`arn:aws:iam::<account>:policy/Spark-RoleBoundary`, except `Spark-<Stage>-GitHubDeploy`, which carries
`Spark-DeployRoleBoundary` and, like `Spark-Account-GitHubOidc`, is deployed only with admin credentials
(`CliCredentialsStackSynthesizer`). See `infra/policies/` and `infra/README.md` "Least-privilege bootstrap".

```jsonc
// app-config-dev.json. Prod: throttles 500/1000, CreateProfile 20, Recover 5, Share 10, Save 200, ReservedConcurrency 0 for now (100 once the Lambda quota increase is granted)
// (0 or missing = no reservation; Lambda needs the account's unreserved concurrency to stay >= 100), LogRetentionDays 30,
// PITR + RetainOnDelete true, CspReportOnly true until the report-only soak is done, Api5xxThreshold 1.
// Route throttles (burst = 2x rate) apply to POST /api/profiles, POST /api/profiles/recover, POST /api/shares, PUT /api/profiles/me.
// The Lambda uses JSON log format; a metric filter on level ERROR/error feeds the Spark/<Stage> ApiLoggedErrors alarm.
{
  "Project": { "Name": "Spark", "Stage": "Dev", "Account": "166147842278", "Region": "us-east-1", "Profile": "spark-dev" },
  "Stack": {
    "Cicd": { "Name": "Cicd", "GitHubRepo": "Njones27/AWS_Spark", "GitHubEnvironment": "dev",
              "GitHubSubjectPrefix": "repo:Njones27@153565100/AWS_Spark@1437703955" },  // immutable OIDC sub format
    "Data": { "Name": "Data", "PointInTimeRecovery": false, "RetainOnDelete": false },
    "Api":  { "Name": "Api", "ThrottleRateLimit": 20, "ThrottleBurstLimit": 50, "CreateProfileRateLimit": 5,
              "RecoverRateLimit": 5, "ShareRateLimit": 2, "SaveRateLimit": 10,
              "ReservedConcurrency": 0, "LogRetentionDays": 14 },
    "Web":  { "Name": "Web", "DomainName": "", "HostedZoneId": "", "CspReportOnly": true, "DistPath": "../dist" },
    "Ops":  { "Name": "Ops", "AlarmEmail": "", "Api5xxThreshold": 5 }
  }
}
// app-config-account-dev.json (app-config-account-prod.json: Account 027729116436, Profile spark-prod).
// New accounts have no GitHub OIDC provider, so both create one; set CreateProvider false + ExistingProviderArn to import.
{
  "Project": { "Name": "Spark", "Stage": "Account", "Account": "166147842278", "Region": "us-east-1", "Profile": "spark-dev" },
  "Stack": {
    "GitHubOidc": { "Name": "GitHubOidc", "CreateProvider": true, "ExistingProviderArn": "",
                    "BudgetEmail": "", "BudgetLimitsUsd": [10, 25] }
  }
}
```

Stack names follow the template: `<Name>-<Stage>-<StackName>`, e.g. `Spark-Dev-Web`, `Spark-Account-GitHubOidc` (one per account).

## Frontend

- `src/api/client.ts`: `apiFetch<T>(path, init)` with base `/api`, bearer token from the store, JSON parsing,
  `ApiError { status, code }`, 5 s timeout via `AbortController`. Sync paths never surface errors as scary UI.
- Profile creation is lazy: the first time a level is completed or a Playground design is saved, not on first visit.
- Local dev: `vite.config.ts` adds `server.proxy['/api']` → `process.env.SPARK_API_PROXY` (the dev CloudFront URL,
  `changeOrigin: true`) when that variable is set; otherwise no proxy and the app simply stays offline-only.
