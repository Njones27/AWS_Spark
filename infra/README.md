# Spark infrastructure (AWS CDK)

This is the CDK app that hosts Spark on AWS. It follows the layout of
[aws-cdk-project-template-for-devops](https://github.com/aws-samples/aws-cdk-project-template-for-devops):
there is one JSON config per deploy target, an `AppContext` that loads it, and a `BaseStack` whose
`putParameter` / `getParameter` helpers pass values between stacks through SSM. It runs on current
`aws-cdk-lib`, TypeScript 5.9 and Node 24. The architecture and its reasoning are in
`docs/aws/architecture.html`. The routes, env vars and SSM names that `infra/`, `backend/` and `src/` share
are in `docs/aws/CONTRACT.md`.

```
infra/
├── app-main.ts            entry point (cdk.json: npx tsx app-main.ts)
├── cdk.json               CDK feature flags (current `cdk init` defaults)
├── config/                app-config-account.json, app-config-dev.json, app-config-prod.json
├── lib/template/          AppContext, AppConfig, BaseStack, CommonHelper, CommonGuardian (MIT-0, adapted)
├── lib/create-stacks.ts   creates the stacks listed under "Stack" in the loaded config
├── stack/                 github-oidc, cicd, data, api, web, ops
├── script/                setup_initial.sh, deploy_stacks.sh, destroy_stacks.sh (+ lib.sh)
└── test/                  vitest + aws-cdk-lib/assertions
```

## Stacks

Stack names are `<Project.Name>-<Project.Stage>-<Stack.X.Name>`, for example `Spark-Dev-Web`.

| Config | Stack | What it holds | Deployed by |
|---|---|---|---|
| account | `Spark-Account-GitHubOidc` | GitHub Actions OIDC provider, monthly AWS Budgets ($10, $25) | `setup_initial.sh`, once per account |
| dev / prod | `Spark-<Stage>-Cicd` | IAM role `Spark-<Stage>-GitHubDeploy` that the deploy workflow assumes | `setup_initial.sh` only, never CI |
| dev / prod | `Spark-<Stage>-Data` | DynamoDB table (`pk`/`sk`, on-demand, TTL `ttl`). Prod: PITR, deletion protection, retained on delete | CI |
| dev / prod | `Spark-<Stage>-Api` | HTTP API (7 routes under `/api`, stage + route throttles, access logs), the Node 24 arm64 Lambda (JSON logs), an error-line metric filter | CI |
| dev / prod | `Spark-<Stage>-Web` | Private S3 bucket, CloudFront (OAC, `/api/*` to the HTTP API, security headers), `dist/` upload | CI |
| dev / prod | `Spark-<Stage>-Ops` | SNS alarm topic, 5 alarms, a CloudWatch dashboard | CI |

The deploy order is Data → Api → Web → Ops, set with explicit stack dependencies. The stacks share values
through SSM parameters named `<Project>-<Stage>-<Key>`, for example `Spark-Dev-TableName`.
CloudFormation resolves those parameters **at deploy time**, so `cdk synth` needs no AWS access.

| SSM parameter | Written by | Read by |
|---|---|---|
| `TableName`, `TableArn` | Data | Api (Lambda env, IAM policy) |
| `ApiId`, `ApiDomain`, `FunctionName` | Api | Web (`ApiDomain`), Ops |
| `WebBucketName`, `DistributionId`, `DistributionDomain` | Web | Ops, the deploy smoke test |
| `OriginVerifySecret` | `setup_initial.sh` (plain String, 32 random bytes in hex) | Api (Lambda env), Web (CloudFront origin header) |
| `DeployRoleArn` | Cicd | `setup_initial.sh` (prints it) |

### Config keys

The shapes are in `docs/aws/CONTRACT.md`. Settings that differ by stage:

| Key | dev | prod |
|---|---|---|
| `Data.PointInTimeRecovery` / `Data.RetainOnDelete` | false / false | true / true |
| `Api.ThrottleRateLimit` / `ThrottleBurstLimit` (rps, every route) | 20 / 50 | 500 / 1000 |
| `Api.CreateProfileRateLimit` (`POST /api/profiles`, rps) | 5 | 20 |
| `Api.RecoverRateLimit` (`POST /api/profiles/recover`, rps) | 5 | 5 |
| `Api.ShareRateLimit` (`POST /api/shares`, rps) | 2 | 10 |
| `Api.SaveRateLimit` (`PUT /api/profiles/me`, rps) | 10 | 200 |
| `Api.ReservedConcurrency` (hard cap on Lambda spend; `0` or missing = none) | 0 | 0 for now; set to 100 once the Lambda quota increase is granted |
| `Api.LogRetentionDays` | 14 | 30 |
| `Web.CspReportOnly` | true | true for the first deploys (see [Enforcing the CSP](#enforcing-the-csp)) |
| `Web.DomainName`, `Web.HostedZoneId` | "" | "" (see [Adding a domain](#adding-a-domain-later)) |
| `Ops.Api5xxThreshold` (5xx responses in 5 minutes that page) | 5 | 1 |
| `Ops.AlarmEmail`, `GitHubOidc.BudgetEmail` | "" (no email subscription) | "" |

The per-route rates get a burst of twice the rate. They are a cost guardrail as much as abuse protection.
The write routes are what fill the table and invoke the Lambda most.

**Reserved concurrency.** Lambda accepts a reservation only if at least 100 concurrency stays unreserved in
the account. A fresh account's quota is often 10, which leaves no room for any reservation, so dev reserves
nothing, and prod reserves nothing either until the account's quota increase (10 → 1000, requested 2026-10-31) is
granted. Then set prod to 100, which needs an account quota of at least 200, and redeploy. Confirm the quota before
the first prod deploy (`setup_initial.sh` prints it).

`Web.DistPath` is optional and defaults to `../dist`, relative to `infra/`. You can override it without
editing a file: `-c Stack.Web.DistPath=/some/dir`.

Synth fails with a `[config] ...` error if a value is missing or has the wrong type, if a log retention is
not one CloudWatch offers, or if a stack key is unknown. A typo cannot silently drop a throttle. If `dist/` has
not been built, synth fails with a `[web] ...` error.

### Enforcing the CSP

Both stages start with `Web.CspReportOnly: true`. Browsers then report CSP violations in the devtools console
but block nothing. After a soak with no violations in dev and prod (including the Playground's image export),
enforce it: in a PR, set `"CspReportOnly": false` in `app-config-prod.json`, and in `app-config-dev.json`
first if you want dev to lead. The Web stack then sends `Content-Security-Policy` instead of
`Content-Security-Policy-Report-Only`. The policy string itself is unchanged.

## Everyday commands

Run `npm ci` once at the repo root. The repo uses npm workspaces, so that installs `infra/` too.

```bash
npm run typecheck -w infra          # tsc, strict
npm test -w infra                   # stack assertions (no build or AWS needed)
npm run build                       # frontend -> dist/ (cdk synth stages it for the Web stack)
cd infra
npx cdk synth --quiet -c APP_CONFIG=config/app-config-dev.json     # or account / prod
npx cdk diff -c APP_CONFIG=config/app-config-prod.json --profile walkworthy
```

`cdk synth` bundles `backend/src/handler.ts` with the locally installed esbuild, so Docker is not needed.
Every `cdk` command synthesizes every stack in the config, so build the frontend first.
If `APP_CONFIG` is missing, the app exits with an `[AppContextError]`. You can also `export APP_CONFIG=...`.

## One-time account setup

You need the AWS CLI v2, Node 24, `openssl`, and admin credentials for the account. The configs use the
SSO profile `walkworthy` (`Project.Profile`). The scripts export it as `AWS_PROFILE`.

```bash
aws sso login --profile walkworthy
cd infra
script/setup_initial.sh config/app-config-account.json config/app-config-dev.json config/app-config-prod.json
```

The script is safe to re-run. It does the following:

1. Checks that the credentials belong to `Project.Account`. Every config must target that one account.
2. Prints the account's Lambda `ConcurrentExecutions` quota. If the quota is below the stage configs'
   `Api.ReservedConcurrency` total plus 100, it warns, lists each stage's reservation, and prints the
   `aws service-quotas request-service-quota-increase` command. It does not stop: dev reserves nothing and
   deploys either way.
3. Builds the frontend (`npm run build` at the repo root). Every `cdk` command synthesizes the whole app,
   including the Web stack that uploads `dist/`, even when it deploys only Cicd. This is why a clean checkout
   needs the build.
4. Runs `cdk bootstrap aws://179326015123/us-east-1`.
5. Deploys `Spark-Account-GitHubOidc`, which holds the OIDC provider and the budgets. The budgets get an
   email notification (ACTUAL > 100%) once `BudgetEmail` is set. An account holds only one GitHub OIDC
   provider. If one already exists, set `CreateProvider: false` and `ExistingProviderArn`.
6. For each stage:
   - creates `Spark-<Stage>-OriginVerifySecret` if it does not exist yet
   - deploys `Spark-<Stage>-Cicd`. CDK asks you to confirm the IAM changes.
   - prints the GitHub environment variables, plus the matching `gh variable set` commands

### GitHub environments

In the repo, open **Settings → Environments** and create `dev` and `prod`. Give each one these variables
(environment variables, not secrets). `setup_initial.sh` prints the values.

| Variable | Example (dev) |
|---|---|
| `AWS_DEPLOY_ROLE_ARN` | `arn:aws:iam::179326015123:role/Spark-Dev-GitHubDeploy` |
| `AWS_REGION` | `us-east-1` |
| `AWS_ACCOUNT_ID` | `179326015123` |
| `APP_CONFIG` | `config/app-config-dev.json` (relative to `infra/`) |

On `prod`, limit **Deployment branches** to `main` and add **Required reviewers** (the owner). Leave `dev`
open to all branches, because open PRs deploy there (see [How deploys flow](#how-deploys-flow)). Both options
are free on public repos, and [Security notes](#security-notes) explains the trade-off.

The role trusts only `<GitHubSubjectPrefix>:environment:<stage>` with audience `sts.amazonaws.com` (this repo
uses GitHub's immutable subject, `repo:Njones27@153565100/AWS_Spark@1437703955`).
It can only assume the four `cdk-hnb659fds-*` bootstrap roles and read two SSM parameters: the bootstrap
version, and `Spark-<Stage>-DistributionDomain` for the smoke test. Sessions last at most 2 hours.

## How deploys flow

```
push to a PR ──> ci.yml ──> verify: typecheck:all, test:all, build, cdk synth (no AWS credentials)
                          ──> deploy-dev: deploy the PR to dev, smoke test      (branches of this repo only)
merge to main ──> deploy.yml ──> dev: deploy, smoke test ──> prod: waits for approval, deploy, smoke test
```

- **PRs only ever reach dev.** Each push to an open PR re-runs the checks and, when they pass, deploys that PR
  to dev so you can try it at the dev URL (GitHub links it on the PR as "deployed to dev"). Prod is reachable
  only from `main` (`deploy.yml`), after the owner approves the `prod` environment.
- Dev holds whatever deployed last: the newest PR push, or `main` after a merge. With two PRs open at once,
  the last one pushed wins until the other is pushed again.
- Dev deploys from PRs and from `main` share one queue. If a PR push queues behind a running dev deploy while a
  merge-to-main dev deploy is also waiting, GitHub keeps only the newest, so the main run's `dev` job is cancelled
  and its `prod` job is skipped. Nothing reaches prod; re-run **Actions → Deploy** for that merge.
- PRs from forks run `verify` only. They get no OIDC token, and their code never runs with AWS credentials.
- A newer push to the same PR cancels its old checks, but never a deploy that has started (job-level
  concurrency, see below).

- `deploy.yml` calls `deploy-stage.yml` once per environment. Each stage job uses the concurrency group
  `deploy-<environment>`. Only one deploy per environment runs at a time, none is cancelled half-way, and if
  several queue up, GitHub keeps only the newest. A prod deploy waiting for approval therefore never blocks the
  next dev deploy.
- Each stage job does the following:
  - checks that its environment variables are set and that `APP_CONFIG` targets `AWS_ACCOUNT_ID`
  - assumes the role through OIDC
  - builds the frontend with `APP_VERSION=<sha>`
  - runs `cdk deploy Spark-<Stage>-{Data,Api,Web,Ops} --require-approval never`
  - runs the smoke test: `GET https://<DistributionDomain>/api/health` must contain `"ok":true`, and
    `HEAD /` must return 200
- **Cicd is never deployed by CI.** It holds the role CI runs as, so a bad change there would lock CI out.
  To change it (for example when the repo is renamed), re-run `setup_initial.sh`.
- Manual run: in **Actions → Deploy → Run workflow**, choose `dev` (dev only) or `prod` (dev, then prod after
  approval).
- Break-glass deploy from a laptop does the same thing as the workflow (build, then the same four stacks):
  `script/deploy_stacks.sh config/app-config-dev.json`.

The Web stack uploads `dist/` in two passes, and neither pass deletes anything (`prune: false`). A student
whose browser still holds yesterday's `index.html` can still load yesterday's chunks.

| Path | Cache-Control |
|---|---|
| `assets/**` (hashed) | `public, max-age=31536000, immutable` |
| everything else (`index.html`, icons) | `public, max-age=0, s-maxage=86400, must-revalidate` |

Each deploy also creates one `/*` invalidation, which is within the 1,000 free paths a month.

### Rotating the origin-verify secret

```bash
aws ssm put-parameter --name Spark-Prod-OriginVerifySecret --type String --overwrite --value "$(openssl rand -hex 32)"
cd infra && npx cdk deploy Spark-Prod-Api Spark-Prod-Web --force -c APP_CONFIG=config/app-config-prod.json
```

`--force` is needed because the templates have not changed: CloudFormation reads the new value only when it
updates the stack. `/api/*` returns 403 for the few minutes between the Api update and the Web update.

### Alarms

| Alarm | Fires when (5-minute window) |
|---|---|
| `ApiLoggedErrors` | the Lambda logs at least one error-level line |
| `Api5xx` | the HTTP API returns at least `Ops.Api5xxThreshold` 5xx responses (prod 1, dev 5) |
| `LambdaErrors` | the Lambda crashes or times out at least once |
| `LambdaThrottles` | at least one invocation is throttled (reserved concurrency or the account quota) |
| `CloudFront5xxRate` | CloudFront's 5xx error rate reaches 5% |

The handler turns every exception into a 500 response. Lambda's own `Errors` metric therefore stays flat for
handled failures, and `ApiLoggedErrors` and `Api5xx` are the alarms that see them.

`ApiLoggedErrors` comes from a metric filter on the function's log group, which feeds the custom metric
`Spark/<Stage> ApiLoggedErrors`. The function logs in Lambda's JSON format, so every log line is a JSON object
and `console.error` lines carry `"level":"ERROR"`. With the default text format, each line starts with a
timestamp and request ID, which is not JSON, so a `{ $.level = ... }` filter would never match. The filter is
`{ ($.level = "ERROR") || ($.level = "error") }`, which also matches the handler's own lowercase `level` field
if it ever writes JSON lines directly.

> **Lambda concurrency quota (account 179326015123).** The account's quota was 10 when this was set up, so
> `Api.ReservedConcurrency` is `0` in both stage configs for now. A quota increase to 1000 was requested on 2026-10-31
> (Service Quotas, `L-B99A9384`). Once it is granted, set prod back to `100` and redeploy.

## Security notes

- **Deploy roles are effectively admin.** `cdk bootstrap` gives the CloudFormation execution role
  (`cdk-hnb659fds-cfn-exec-role-*`) `AdministratorAccess` by default. Each GitHub deploy role can only assume
  the bootstrap roles, but through them it can deploy any CloudFormation template, so either environment's role
  can change anything in the account. The controls that matter are on the GitHub side:
  - `prod` accepts deployments only from `main`, and needs a required reviewer before every deploy.
  - `main` requires a reviewed PR (the `Mainline_shield` ruleset).
  - `dev` accepts any branch of this repo, so open PRs can deploy there. Fork PRs never get credentials. The
    trade-off: because the bootstrap execution role is admin, a branch pushed to this repo could deploy a template
    that touches prod resources in the same account. Only people with write access can push branches, so this is
    acceptable for a solo repo. Moving prod to its own account (below) removes it.
  - Each role trusts exactly one `repo:...:environment:<stage>` subject.
- **Hardening path:**
  - Re-bootstrap with `cdk bootstrap --cloudformation-execution-policies <ARN of a narrower managed policy>`.
    The policy must cover the services these stacks use: S3, CloudFront, Lambda, API Gateway, DynamoDB, IAM
    roles for those, SSM, CloudWatch, SNS, Route 53, ACM. Or:
  - Move prod to its own AWS account (see [Moving to another AWS account](#moving-to-another-aws-account)).
    Then the dev role cannot reach prod at all.
- The Cicd stacks are deployed only by hand (`setup_initial.sh`), so CI cannot widen its own trust policy.
- The origin-verify secret is a plain SSM String. It also appears in the CloudFront and Lambda configuration,
  so anyone who can read those can read it. It stops casual direct calls to `execute-api`; it is not an
  authentication boundary.

## Tearing down

```bash
cd infra && script/destroy_stacks.sh config/app-config-dev.json   # asks you to type the stage name
```

This destroys every stack in that config, Cicd included. Some resources are kept on purpose, and the script
prints the commands to remove them:

- prod's DynamoDB table (retained, deletion protection on)
- prod's site bucket (retained)
- the `OriginVerifySecret` parameter

## Moving to another AWS account

Account IDs live only in `infra/config/*.json` and in the GitHub environment variables, so the move needs
no code changes.

1. **New account.** Run `script/setup_initial.sh` with the new account's profile, after setting
   `Project.Account`, `Project.Region` and `Project.Profile` in the configs you pass it. The script
   bootstraps the account and creates the OIDC provider, the Cicd roles, the SSM secret, and the quota check.
2. **Config PR.** Open a PR that changes `Project.Account` (and `Region` if wanted) in
   `app-config-prod.json`, or in all three configs if dev moves too. If the repo changes owner, also change
   `Stack.Cicd.GitHubRepo`.
3. **GitHub.** Update `AWS_DEPLOY_ROLE_ARN` and `AWS_ACCOUNT_ID` on the environment that moves. The trust
   policy's `sub` claim does not change. Merge the PR, or run `deploy.yml`.
4. **Data.** Copy the table across. The quick way is a scan → batch-write script that reads with one profile
   and writes with the other (each profile is a few kilobytes). If the table has grown, use a PITR export to
   S3 and then `ImportTable`.
5. **Hostname.**
   - Without a domain, the `*.cloudfront.net` name changes. Keep the old distribution for 90 days with a
     CloudFront Function that answers 301 to the new host. Browsers keep the `#` fragment, so share links
     still work.
   - With a domain, create the hosted zone in the new account and lower the TTLs a day early. Then flip the
     alias and repoint the registrar's nameservers.
6. **Old account.** Once the new one is verified, run `script/destroy_stacks.sh` in the old account. Delete
   the retained prod table after 30 days.

## Adding a domain later

1. Create a public Route 53 hosted zone for the domain in the same account, or register the domain with
   Route 53, which creates the zone. Point the registrar's nameservers at the zone **before** deploying:
   the certificate is validated through DNS in that zone, and the deploy waits for validation.
2. In the stage config, set `Web.DomainName` (for example `spark.example.org`, or `dev.spark.example.org`
   for dev) and `Web.HostedZoneId` (the ID of the zone that contains that name). Merge the change.
3. The Web stack then adds three things:
   - an ACM certificate, DNS-validated in that zone. It must be in us-east-1 for CloudFront, and synth
     refuses other regions.
   - the alternate domain name on the distribution
   - A and AAAA alias records
   The `SiteUrl` output switches to the domain. `DistributionDomain` (used by the smoke test) stays the
   `*.cloudfront.net` name, which keeps working.
4. Register the domain before any public launch: links shared on the CloudFront hostname break when that
   hostname changes.

## Troubleshooting

- **`Unable to fetch parameters [Spark-Dev-OriginVerifySecret]`** (or `TableName` ...): `setup_initial.sh`
  has not run for this stage, or a stack earlier in the order has not been deployed yet.
- **`ReservedConcurrentExecutions ... decreases account's UnreservedConcurrentExecution below its minimum`**:
  the account quota is below that stage's reservation plus 100. Request the quota increase that
  `setup_initial.sh` prints, or set `Api.ReservedConcurrency` to 0 for that stage until it is granted.
- **`[web] .../dist has no index.html or assets/`**: run `npm run build` at the repo root first.
- **`No valid AWS credentials`** from the scripts: run `aws sso login --profile walkworthy`.
- **CI: `Variable X is not set on the 'dev' environment`**: add it under **Settings → Environments**.
