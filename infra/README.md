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
├── config/                app-config-account-{dev,prod}.json, app-config-dev.json, app-config-prod.json
├── lib/template/          AppContext, AppConfig, BaseStack, CommonHelper, CommonGuardian (MIT-0, adapted)
├── lib/create-stacks.ts   creates the stacks listed under "Stack" in the loaded config
├── lib/permissions-boundary.ts  puts the Spark-RoleBoundary permissions boundary on every app IAM role
├── policies/              least-privilege CDK exec policies + the role boundary (see "Least-privilege bootstrap")
├── stack/                 github-oidc, cicd, data, api, web, ops
├── script/                setup_initial.sh, deploy_stacks.sh, destroy_stacks.sh (+ lib.sh)
└── test/                  vitest + aws-cdk-lib/assertions
```

## Stacks

Stack names are `<Project.Name>-<Project.Stage>-<Stack.X.Name>`, for example `Spark-Dev-Web`. Dev and prod live in
separate AWS accounts (see [AWS accounts](#aws-accounts)), so each account holds one `Spark-Account-GitHubOidc` stack
and one stage's five stacks.

| Config | Stack | What it holds | Deployed by |
|---|---|---|---|
| account-dev / account-prod | `Spark-Account-GitHubOidc` | GitHub Actions OIDC provider, monthly AWS Budgets ($10, $25) | `setup_initial.sh`, once per account |
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
the account. A new account's quota is often 10, which leaves no room for any reservation, so dev reserves
nothing, and prod reserves nothing either until the prod account's quota increase (10 → 1000) is granted. Then set
prod to 100, which needs an account quota of at least 200, and redeploy. `setup_initial.sh` prints the prod
account's quota and the request command.

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
npx cdk synth --quiet -c APP_CONFIG=config/app-config-dev.json     # or account-dev / account-prod / prod
npx cdk diff -c APP_CONFIG=config/app-config-prod.json --profile spark-prod
```

`cdk synth` bundles `backend/src/handler.ts` with the locally installed esbuild, so Docker is not needed.
Every `cdk` command synthesizes every stack in the config, so build the frontend first.
If `APP_CONFIG` is missing, the app exits with an `[AppContextError]`. You can also `export APP_CONFIG=...`.

## AWS accounts

Dev and prod run in two AWS Organizations member accounts, both in `us-east-1`. A dev deploy role cannot reach
prod at all, and each account's CDK deploys are least-privilege from the first bootstrap
(see [Least-privilege bootstrap](#least-privilege-bootstrap)).

| Stage | Account | SSO profile (`Project.Profile`) | Account config | Stage config | GitHub environment |
|---|---|---|---|---|---|
| dev | `166147842278` | `spark-dev` | `config/app-config-account-dev.json` | `config/app-config-dev.json` | `dev` |
| prod | `027729116436` | `spark-prod` | `config/app-config-account-prod.json` | `config/app-config-prod.json` | `prod` |

Both account configs have `Project.Stage` `Account`, so each account gets a stack named `Spark-Account-GitHubOidc`.
That is fine: the two stacks are in different accounts. The scripts export `Project.Profile` as `AWS_PROFILE`.

> Spark used to run dev and prod in one account (`179326015123`). That account is being retired and torn down
> separately; nothing in this repo targets it any more.

## One-time account setup

You need the AWS CLI v2, Node 24, `openssl`, and admin credentials (the SSO profile above) for the account. Run the
script once per account, with that account's account config and stage config:

```bash
cd infra
aws sso login --profile spark-dev
script/setup_initial.sh config/app-config-account-dev.json config/app-config-dev.json

aws sso login --profile spark-prod
script/setup_initial.sh config/app-config-account-prod.json config/app-config-prod.json
```

`SETUP_YES=1 script/setup_initial.sh ...` skips CDK's IAM-change prompts (for a non-interactive shell).
The script is safe to re-run. It does the following:

1. Checks that the credentials belong to `Project.Account`, and that the two configs target the same account
   and region.
2. Prints the account's Lambda `ConcurrentExecutions` quota. If the quota is below the stage's
   `Api.ReservedConcurrency` plus 100, it warns and prints the `aws service-quotas request-service-quota-increase`
   command. It does not stop: a stage that reserves nothing deploys either way.
3. Builds the frontend (`npm run build` at the repo root). Every `cdk` command synthesizes the whole app,
   including the Web stack that uploads `dist/`, even when it deploys only Cicd. This is why a clean checkout
   needs the build.
4. Creates or updates four customer-managed policies from `infra/policies/` (with the account ID and region
   filled in): `Spark-RoleBoundary`, `Spark-DeployRoleBoundary`, `Spark-CdkCfnExec` and `Spark-CdkCfnExecWebOps`. A policy whose document
   changed gets a new default version; IAM keeps at most 5, so the oldest non-default version is deleted first.
5. Runs `cdk bootstrap aws://<account>/us-east-1 --cloudformation-execution-policies
   arn:aws:iam::<account>:policy/Spark-CdkCfnExec,arn:aws:iam::<account>:policy/Spark-CdkCfnExecWebOps`, so the
   CloudFormation execution role never gets `AdministratorAccess`.
6. Deploys `Spark-Account-GitHubOidc` with your own (admin) credentials, not through the exec role, which holds the OIDC provider and the budgets. The budgets get an
   email notification (ACTUAL > 100%) once `BudgetEmail` is set. A new account has no GitHub OIDC provider, so both
   account configs have `CreateProvider: true`. An account holds only one provider per URL: if one already exists,
   set `CreateProvider: false` and `ExistingProviderArn`.
7. For the stage:
   - creates `Spark-<Stage>-OriginVerifySecret` if it does not exist yet
   - deploys `Spark-<Stage>-Cicd`, also with your own credentials. CDK asks you to confirm the IAM changes.
   - prints the GitHub environment variables, plus the matching `gh variable set` commands

### GitHub environments

In the repo, open **Settings → Environments** and create `dev` and `prod`. Give each one these variables
(environment variables, not secrets). `setup_initial.sh` prints the values.

| Variable | Example (dev) |
|---|---|
| `AWS_DEPLOY_ROLE_ARN` | `arn:aws:iam::166147842278:role/Spark-Dev-GitHubDeploy` (prod: `arn:aws:iam::027729116436:role/Spark-Prod-GitHubDeploy`) |
| `AWS_REGION` | `us-east-1` |
| `AWS_ACCOUNT_ID` | `166147842278` (prod: `027729116436`) |
| `APP_CONFIG` | `config/app-config-dev.json` (prod: `config/app-config-prod.json`; relative to `infra/`) |

On **both** environments, limit **Deployment branches** to `main`. On `prod`, also add **Required
reviewers** (the owner). Both options are free on public repos, and [Security notes](#security-notes)
explains why both are needed.

The role trusts only `repo:Njones27/AWS_Spark:environment:<stage>` with audience `sts.amazonaws.com`.
It can only assume two bootstrap roles, `cdk-hnb659fds-deploy-role-*` and `cdk-hnb659fds-file-publishing-role-*`
(the app has no context lookups and no Docker assets, so CI never needs the lookup or image-publishing roles), and
read two SSM parameters: the bootstrap
version, and `Spark-<Stage>-DistributionDomain` for the smoke test. Sessions last at most 2 hours.

## How deploys flow

```
PR to main ──> ci.yml: npm ci, typecheck:all, test:all, build, cdk synth (account-dev, account-prod, dev, prod). No AWS credentials.
merge to main ──> deploy.yml ──> dev: deploy, smoke test ──> prod: waits for approval, deploy, smoke test
```

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
export AWS_PROFILE=spark-prod
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

> **Lambda concurrency quota (prod account 027729116436).** New accounts start with a quota of 10, so
> `Api.ReservedConcurrency` is `0` in both stage configs for now. Request an increase to 1000 in the prod account
> (Service Quotas, `L-B99A9384`; `setup_initial.sh` prints the command). Once it is granted, set prod back to `100`
> and redeploy. Dev does not reserve concurrency.

## Security notes

- **Deploys are least-privilege, not admin.** The CloudFormation execution role (`cdk-hnb659fds-cfn-exec-role-*`)
  runs with `Spark-CdkCfnExec` and `Spark-CdkCfnExecWebOps`, not bootstrap's default `AdministratorAccess`, and
  every role the app creates is capped by `Spark-RoleBoundary` (the GitHub deploy roles by the narrower
  `Spark-DeployRoleBoundary`). Each GitHub deploy role can only assume the deploy and file-publishing bootstrap roles, so the most a deploy can do is create and change Spark's own resources. Details:
  [Least-privilege bootstrap](#least-privilege-bootstrap).
- **One account per stage.** The dev role cannot reach prod at all; the deploy roles never share an account.
- The controls on the GitHub side still matter, because a deploy can still replace or delete Spark's resources:
  - Both environments, `dev` and `prod`, accept deployments only from the `main` branch.
  - `main` requires a reviewed PR (the `Mainline_shield` ruleset).
  - `prod` also needs a required reviewer before every deploy.
  - Each role trusts exactly one `repo:...:environment:<stage>` subject.
- **CI cannot rewrite its own trust.** The `Spark-<Stage>-Cicd` and `Spark-Account-GitHubOidc` stacks use
  `CliCredentialsStackSynthesizer`: `setup_initial.sh` deploys them with the admin credentials of the shell, never
  through the bootstrap roles (their manifests name no role to assume, and their only asset is the template). The exec
  policy denies every change to `role/Spark-*-GitHubDeploy` (create, delete, trust, inline and attached policies,
  boundary) and every OIDC provider write, so even a CI deploy that targeted those stacks would fail.
  `deploy.yml` and `deploy_stacks.sh` leave Cicd out anyway.
- **Known gaps, accepted for now:**
  - `logs:PutResourcePolicy` is allowed on `*` because HTTP API access logging needs it and the action has no
    resource-level permissions. A deploy could therefore change CloudWatch Logs resource policies account-wide.
  - `s3:PutBucketPublicAccessBlock` and `s3:PutBucketPolicy` on `spark-*` buckets mean a deploy could make the site
    bucket public. Consider an SCP (deny those on `spark-*` unless the public access block stays on) once the accounts
    sit under an organization policy.
- The origin-verify secret is a plain SSM String. It also appears in the CloudFront and Lambda configuration,
  so anyone who can read those can read it. It stops casual direct calls to `execute-api`; it is not an
  authentication boundary.

## Least-privilege bootstrap

`cdk bootstrap` creates `cdk-hnb659fds-cfn-exec-role-<account>-<region>`, the role CloudFormation uses to create
every resource, and by default attaches `AdministratorAccess` to it. Spark replaces that in every account, from the
first bootstrap, with customer-managed policies kept in `infra/policies/` (comment-free JSON, so the
reasoning lives here). `setup_initial.sh` fills in `${ACCOUNT_ID}` and `${REGION}` and creates or updates them.

| Policy | File | Attached to |
|---|---|---|
| `Spark-CdkCfnExec` | `cfn-exec-policy.json` | the exec role: IAM roles (plus the denies), Lambda, API Gateway, SSM, Logs |
| `Spark-CdkCfnExecWebOps` | `cfn-exec-web-ops-policy.json` | the exec role: DynamoDB, S3 site buckets, CloudFront, CloudWatch, SNS, Budgets, ACM, Route 53 |
| `Spark-RoleBoundary` | `role-boundary.json` | permissions boundary of every app IAM role (Lambda and custom resource roles) |
| `Spark-DeployRoleBoundary` | `deploy-role-boundary.json` | permissions boundary of the `Spark-<Stage>-GitHubDeploy` roles only |

The exec permissions are two policies only because a managed policy holds at most 6,144 characters; the test
`policy files` checks each file against that limit.

**How the pieces fit.**

- Everything is scoped to Spark's names where the service supports resource-level permissions: `role/Spark-*`,
  `function:Spark-*`, `table/Spark-*`, `parameter/Spark-*`, `log-group:Spark-*` and `log-group:/aws/lambda/Spark-*`,
  `alarm:Spark-*`, `dashboard/Spark-*`, `budget/Spark-*`, SNS `Spark-*`, and S3 `spark-*` (CloudFormation lowercases
  generated bucket names). Resources without a name CloudFormation generates `<StackName>-<LogicalId>-<random>`, and
  every stack name starts with `Spark-`.
- Exceptions, and why:
  - CloudFront distributions, OACs and response-headers policies, ACM certificates and Route 53 zones have random IDs,
    so they are scoped to the resource type in this account (`distribution/*`, `certificate/*`, ...).
    `route53:ChangeResourceRecordSets` is also limited to A, AAAA and CNAME records (the alias records and ACM's
    validation record).
  - The BucketDeployment's AWS CLI layers are named after their logical ID (`DeployAssetsAwsCliLayer...`), not the
    stack, so they are scoped to `layer:*AwsCliLayer*`.
  - The HTTP API uses API Gateway's REST-style actions on `arn:aws:apigateway:<region>::/apis*` and `/tags/*`.
  - `"Resource": "*"` is used only for actions with no resource-level permissions: the `List*`/`Describe*` calls
    CloudFormation makes, `cloudfront:Create{Distribution,OriginAccessControl,ResponseHeadersPolicy}`,
    `acm:RequestCertificate`, and the CloudWatch Logs log-delivery calls (plus `logs:PutResourcePolicy`) that HTTP
    API access logging needs.
  - The exec role reads the CDK assets bucket (`cdk-hnb659fds-assets-<account>-<region>`) for Lambda code and layers,
    and may `kms:Decrypt` only through S3 (`kms:ViaService`), because bootstrap encrypts that bucket with the
    `aws/s3` key.
  - Cache and origin-request policies are not in the policies: the app uses CloudFront's managed ones. Add them if a
    stack ever creates its own.
- **IAM roles are the escalation risk**, so:
  - `iam:CreateRole`, `PutRolePolicy`, `AttachRolePolicy`, `PutRolePermissionsBoundary`, `UpdateAssumeRolePolicy`,
    `UpdateRole` and `UpdateRoleDescription` are allowed only on `role/Spark-*` **and** only when the role's
    permissions boundary is `Spark-RoleBoundary` (condition `iam:PermissionsBoundary`). A deploy can attach any
    policy to a Spark role, even `AdministratorAccess`, and the role can still do no more than the boundary allows.
  - `iam:PassRole` is limited to `role/Spark-*` passed to `lambda.amazonaws.com`.
  - `lambda:AddPermission`/`RemovePermission` require `lambda:Principal` = `apigateway.amazonaws.com`, the only
    principal any synthesized `AWS::Lambda::Permission` uses (a test keeps the two in step), so a deploy cannot
    open a Spark function to another account or service.
  - Both exec policies deny `iam:DeleteRolePermissionsBoundary` everywhere, and deny `CreatePolicyVersion`,
    `DeletePolicy`, `DeletePolicyVersion` and `SetDefaultPolicyVersion` on the four Spark policies, so a deploy
    cannot loosen its own limits. The exec role cannot create users, groups, managed policies or access keys at all.
  - `Spark-CdkCfnExec` also denies every change to `role/Spark-*-GitHubDeploy` and every OIDC provider write (see
    [Security notes](#security-notes)); those are deployed with admin credentials.
- **The boundaries** allow exactly what the roles use, read from the synthesized role policies:
  - API Lambda: the table read/write actions on `table/Spark-*` (Query, GetItem, PutItem, UpdateItem, DeleteItem,
    BatchWriteItem, ConditionCheckItem; transactions are authorized per item), and CloudWatch Logs writes on Spark log
    groups.
  - BucketDeployment: read the CDK assets bucket, write objects to `spark-*` buckets, `kms:Decrypt` via S3,
    `cloudfront:CreateInvalidation`/`GetInvalidation` on distributions.
  - autoDeleteObjects (dev's bucket): list and delete objects and put the bucket policy on `spark-*` buckets. The
    bucket policy grants these to the provider role, and the boundary still caps them.
  - GitHub deploy role (`Spark-DeployRoleBoundary`, nothing else in it): `sts:AssumeRole` on exactly
    `cdk-hnb659fds-deploy-role-<account>-<region>` and `cdk-hnb659fds-file-publishing-role-<account>-<region>`, and
    `ssm:GetParameter` on `/cdk-bootstrap/hnb659fds/version` and `parameter/Spark-*`. `Spark-RoleBoundary` allows no
    `sts:AssumeRole` at all.
- `lib/permissions-boundary.ts` adds `Spark-RoleBoundary` to every stack with an aspect that matches the
  CloudFormation type `AWS::IAM::Role`, so it also covers roles made as plain `CfnResource`s, such as the
  autoDeleteObjects custom resource provider role. It skips a role that sets its own boundary, which only the deploy
  role in `stack/cicd-stack.ts` does (`Spark-DeployRoleBoundary`).

**Tests that hold it together** (`test/least-privilege.test.ts`): every `AWS::IAM::Role` in every config
(account-dev, account-prod, dev, prod, plus variants with a domain and email subscriptions) has `Spark-RoleBoundary`,
except the two GitHub deploy roles, which have `Spark-DeployRoleBoundary`; every role name (explicit, or
CloudFormation's `<stack>-<logicalId>-<random>`) falls inside `role/Spark-*`; every resource type maps to a service the
exec policies allow (`Custom::*` must be a Spark Lambda the exec role may invoke); every action in the roles' policies
is allowed by their boundary; the account and Cicd stacks synthesize with CLI credentials (no role to assume, no
Docker assets); every Lambda permission principal is covered by the `lambda:Principal` condition; CI may assume exactly
the deploy and file-publishing roles; and the files parse, fit IAM's size limit and keep their deny statements.

**Adding an AWS service or resource.** If a change adds a resource type or a role permission, the coverage test fails
and points here. Then:

1. Look up what CloudFormation needs for the new type:
   `aws cloudformation describe-type --type RESOURCE --type-name AWS::<Service>::<Type> --query Schema --output text`
   and read `handlers.{create,read,update,delete}.permissions`. Keep only the actions the template's properties
   actually use.
2. Add them to the exec policy whose services fit (or a new statement), scoped to `Spark-*` names where the service
   supports resource-level permissions (the Service Authorization Reference lists which actions do). Add the
   CloudFormation-to-IAM prefix to `IAM_PREFIX` in the test if it is a new service.
3. If an app role gains a permission, add it to `role-boundary.json` too, as narrowly as the role policy allows.
4. Run `npm test -w infra`, then re-run `setup_initial.sh` for **both** accounts, which publishes the new policy
   versions. Do this before merging, or the next CI deploy fails with `AccessDenied` on the exec role.

**Re-bootstrapping an account that already exists** (for example one bootstrapped with `AdministratorAccess`):
re-run `script/setup_initial.sh <account-config> <stage-config>` for it. It creates the policies and re-runs
`cdk bootstrap` with `--cloudformation-execution-policies`, which replaces the exec role's managed policies. By hand
the same is:

```bash
cd infra
source script/lib.sh
ensure_managed_policy <account> us-east-1 Spark-RoleBoundary policies/role-boundary.json "Spark role boundary"
ensure_managed_policy <account> us-east-1 Spark-DeployRoleBoundary policies/deploy-role-boundary.json "Spark deploy role boundary"
ensure_managed_policy <account> us-east-1 Spark-CdkCfnExec policies/cfn-exec-policy.json "Spark CDK exec"
ensure_managed_policy <account> us-east-1 Spark-CdkCfnExecWebOps policies/cfn-exec-web-ops-policy.json "Spark CDK exec web/ops"
npx cdk bootstrap aws://<account>/us-east-1 -c APP_CONFIG=config/app-config-account-<stage>.json \
  --cloudformation-execution-policies "arn:aws:iam::<account>:policy/Spark-CdkCfnExec,arn:aws:iam::<account>:policy/Spark-CdkCfnExecWebOps"
```

Roles created before the boundary existed get it on their next deploy (CloudFormation calls
`PutRolePermissionsBoundary`, which the exec policy allows with the Spark boundary). If such an update fails on
`AccessDenied`, deploy that stack once with admin credentials so the role picks up the boundary.

## Tearing down

```bash
cd infra && script/destroy_stacks.sh config/app-config-dev.json   # asks you to type the stage name
```

This destroys every stack in that config, Cicd included. Some resources are kept on purpose, and the script
prints the commands to remove them:

- prod's DynamoDB table (retained, deletion protection on)
- prod's site bucket (retained)
- the `OriginVerifySecret` parameter

The account-level pieces stay too: `Spark-Account-GitHubOidc` (destroy it with the account config), the `CDKToolkit`
bootstrap stack and the four `Spark-*` managed policies from `setup_initial.sh`.

## Swapping to a new pair of AWS accounts (handoff runbook)

Account IDs live only in `infra/config/*.json` and in the GitHub environment variables, so moving to new accounts
(for example when the project is handed to another owner or organization) needs no code changes.

1. **Set up each new account.** Create an SSO profile for each, then edit `Project.Account` and `Project.Profile`
   (and `Region` if wanted) in the account config and stage config of that account. Run
   `script/setup_initial.sh config/app-config-account-<stage>.json config/app-config-<stage>.json` once per account.
   It creates the policies, bootstraps least-privilege, creates the OIDC provider, the budgets, the SSM secret and the
   Cicd role, and prints the quota check and the GitHub variables. Request the Lambda quota increase in the prod
   account if prod will reserve concurrency.
2. **Config PR.** Open a PR with the config changes (all four files) and update the account table in this README and
   the IDs in `test/helpers.ts` (`ACCOUNTS`). If the repo changes owner, also change `Stack.Cicd.GitHubRepo` and
   `Stack.Cicd.GitHubSubjectPrefix` (read it with `gh api repos/<owner>/<repo>/actions/oidc/customization/sub`), and
   re-run step 1's Cicd deploy.
3. **GitHub.** Set `AWS_DEPLOY_ROLE_ARN`, `AWS_ACCOUNT_ID` (and `AWS_REGION`, `APP_CONFIG` if they changed) on the
   `dev` and `prod` environments with the `gh variable set` commands `setup_initial.sh` printed. Merge the PR, or run
   `deploy.yml`. The deploy checks that `APP_CONFIG` targets `AWS_ACCOUNT_ID`, so a half-done swap fails fast.
4. **Prod data.** Copy the prod DynamoDB table into the new prod account's table. The quick way is a scan →
   batch-write script that reads with the old profile and writes with the new one (each profile is a few
   kilobytes). If the table has grown, use a PITR export to S3 and then `ImportTable`. Dev data can be left behind.
5. **Domain cutover.**
   - Without a domain, the `*.cloudfront.net` name changes. Keep the old distribution for 90 days with a
     CloudFront Function that answers 301 to the new host. Browsers keep the `#` fragment, so share links
     still work.
   - With a domain, create the hosted zone in the new prod account and lower the TTLs a day early, set
     `Web.HostedZoneId` to the new zone, deploy, then flip the alias and repoint the registrar's nameservers.
6. **Old accounts.** Once the new ones are verified, run `script/destroy_stacks.sh` against the old accounts (with
   configs that still point at them). Delete the retained prod table after 30 days.

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
- **`Could not assume role with OIDC: Not authorized to perform sts:AssumeRoleWithWebIdentity`**: the role's trusted
  `sub` doesn't match GitHub's token. Newer repos use GitHub's immutable subject format
  (`repo:<owner>@<ownerId>/<repo>@<repoId>:environment:<env>`). Read the prefix with
  `gh api repos/<owner>/<repo>/actions/oidc/customization/sub` (`sub_claim_prefix`), put it in `Cicd.GitHubSubjectPrefix`
  in each stage config, and redeploy the Cicd stacks by hand (`npx cdk deploy Spark-Dev-Cicd -c APP_CONFIG=config/app-config-dev.json`,
  same for prod). This repo's prefix is `repo:Njones27@153565100/AWS_Spark@1437703955`. If the repo moves to a new owner,
  the prefix changes too.
- **`No valid AWS credentials`** from the scripts: run `aws sso login --profile spark-dev` (or `spark-prod`; the
  profile is `Project.Profile` in the config you passed).
- **`... is not authorized to perform: <action> ... cdk-hnb659fds-cfn-exec-role-...`** during a deploy: a stack uses
  an action the exec policies do not allow. Add it as described in
  [Least-privilege bootstrap](#least-privilege-bootstrap), then re-run `setup_initial.sh` for both accounts.
- **A role-creating deploy fails with `AccessDenied` on `iam:CreateRole`**: the role is missing the
  `Spark-RoleBoundary` boundary or its name does not start with `Spark-` (or it is a `Spark-*-GitHubDeploy` role,
  which only `setup_initial.sh` may deploy). `npm test -w infra` names the role.
- **CI: `Variable X is not set on the 'dev' environment`**: add it under **Settings → Environments**.
