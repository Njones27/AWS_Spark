#!/usr/bin/env bash
# One-time setup of one AWS account, run by hand from a shell with admin credentials for that account.
# Spark uses one account per stage, so run it once per account:
#
#   infra/script/setup_initial.sh config/app-config-account-dev.json config/app-config-dev.json
#   infra/script/setup_initial.sh config/app-config-account-prod.json config/app-config-prod.json
#
# Adapted from aws-samples/aws-cdk-project-template-for-devops script/setup_initial.sh. It:
# 1. checks the account's Lambda concurrency quota against what the stage config reserves (warns, never stops)
# 2. builds the frontend (every cdk command synthesizes the Web stack, which uploads dist/)
# 3. creates or updates the managed policies in infra/policies/ (Spark-RoleBoundary, Spark-DeployRoleBoundary,
#    Spark-CdkCfnExec, Spark-CdkCfnExecWebOps), then runs `cdk bootstrap aws://<account>/<region>` with the two exec
#    policies as the CloudFormation execution policies, instead of the default AdministratorAccess
# 4. deploys the account config (GitHub OIDC provider, budgets)
# 5. creates the <Project>-<Stage>-OriginVerifySecret SSM parameter (once), deploys <Project>-<Stage>-Cicd, and
#    prints the GitHub environment variables to set
# The account and Cicd stacks use CliCredentialsStackSynthesizer: they deploy with the credentials this script runs
# with, never through the CDK exec role (which is denied changes to the deploy role and the OIDC provider).
#
# Dependencies are not installed here: run `npm ci` at the repo root first. Safe to re-run; re-running it on an
# account that was bootstrapped with AdministratorAccess switches that account to the least-privilege policies.
set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "Usage: $0 <account-config.json> <stage-config.json>   (once per AWS account)" >&2
  exit 64
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"

ACCOUNT_CONFIG="$(abspath "$1")"
STAGE_CONFIG="$(abspath "$2")"
POLICY_DIR="$SCRIPT_DIR/../policies"

cd "$SCRIPT_DIR/.."   # infra/, where cdk.json lives

# SETUP_YES=1 skips CDK's interactive IAM review (for automation or a non-TTY shell); the default keeps the prompt.
APPROVAL=(--require-approval broadening)
if [ "${SETUP_YES:-}" = "1" ]; then APPROVAL=(--require-approval never); fi

echo "==--------CheckDependencies---------=="
aws --version
node --version
npx cdk --version
openssl version
echo

ACCOUNT="$(config_get "$ACCOUNT_CONFIG" Project.Account)"
REGION="$(config_get "$ACCOUNT_CONFIG" Project.Region)"
use_profile "$ACCOUNT_CONFIG"

require_account "$ACCOUNT_CONFIG"

if [ "$(config_get "$STAGE_CONFIG" Project.Account)" != "$ACCOUNT" ] || [ "$(config_get "$STAGE_CONFIG" Project.Region)" != "$REGION" ]; then
  echo "$STAGE_CONFIG targets a different account or region than $ACCOUNT_CONFIG. Pass the account config and the" >&2
  echo "stage config of the same AWS account (account-dev + dev, or account-prod + prod)." >&2
  exit 1
fi

echo "==--------LambdaConcurrencyQuota---------=="
# Lambda refuses a reserved concurrency that would leave less than 100 unreserved in the account.
QUOTA="$(aws lambda get-account-settings --region "$REGION" --query AccountLimit.ConcurrentExecutions --output text)"
echo "ConcurrentExecutions quota in $REGION: $QUOTA"
RESERVED="$(config_get "$STAGE_CONFIG" Stack.Api.ReservedConcurrency)"
RESERVED="${RESERVED:-0}"
NEEDED=$((RESERVED + 100))
if [ "$QUOTA" -lt "$NEEDED" ]; then
  cat <<WARN
WARNING: the quota ($QUOTA) is below the stage reservation plus the 100 Lambda keeps unreserved ($NEEDED).
$(config_get "$STAGE_CONFIG" Project.Name)-$(config_get "$STAGE_CONFIG" Project.Stage) reserves $RESERVED (Api.ReservedConcurrency in $STAGE_CONFIG), so it will fail to deploy until
the quota is raised. Request the default quota, then deploy the stage once it is granted:
  aws service-quotas request-service-quota-increase --region $REGION \\
    --service-code lambda --quota-code L-B99A9384 --desired-value 1000
A stage with ReservedConcurrency 0 deploys fine in the meantime. Continuing.
WARN
else
  echo "OK: covers the stage reservation ($RESERVED) plus 100 unreserved."
fi
echo

echo "==--------BuildFrontend---------=="
(cd .. && npm run build)
echo

echo "==--------LeastPrivilegePolicies---------=="
# The boundaries first: the exec policies only allow creating roles that carry Spark-RoleBoundary, and the Cicd
# stack's deploy role carries Spark-DeployRoleBoundary.
ensure_managed_policy "$ACCOUNT" "$REGION" Spark-RoleBoundary "$POLICY_DIR/role-boundary.json" \
  "Permissions boundary of every Spark app IAM role (infra/policies/role-boundary.json)"
ensure_managed_policy "$ACCOUNT" "$REGION" Spark-DeployRoleBoundary "$POLICY_DIR/deploy-role-boundary.json" \
  "Permissions boundary of the Spark GitHub deploy roles (infra/policies/deploy-role-boundary.json)"
ensure_managed_policy "$ACCOUNT" "$REGION" Spark-CdkCfnExec "$POLICY_DIR/cfn-exec-policy.json" \
  "CDK CloudFormation execution role, IAM and API services (infra/policies/cfn-exec-policy.json)"
ensure_managed_policy "$ACCOUNT" "$REGION" Spark-CdkCfnExecWebOps "$POLICY_DIR/cfn-exec-web-ops-policy.json" \
  "CDK CloudFormation execution role, data, web and ops services (infra/policies/cfn-exec-web-ops-policy.json)"
echo

echo "==--------BootstrapCDKEnvironment---------=="
# Replaces bootstrap's default AdministratorAccess on cdk-hnb659fds-cfn-exec-role-* with the two exec policies.
EXEC_POLICIES="arn:aws:iam::$ACCOUNT:policy/Spark-CdkCfnExec,arn:aws:iam::$ACCOUNT:policy/Spark-CdkCfnExecWebOps"
APP_CONFIG="$ACCOUNT_CONFIG" npx cdk bootstrap "aws://$ACCOUNT/$REGION" \
  --cloudformation-execution-policies "$EXEC_POLICIES" -c APP_CONFIG="$ACCOUNT_CONFIG"
echo

echo "==--------DeployAccountStacks---------=="
# With this shell's credentials (CliCredentialsStackSynthesizer), not the exec role.
npx cdk deploy --all "${APPROVAL[@]}" -c APP_CONFIG="$ACCOUNT_CONFIG"
echo

GITHUB_SETUP=""
PREFIX="$(config_get "$STAGE_CONFIG" Project.Name)-$(config_get "$STAGE_CONFIG" Project.Stage)"
SECRET_NAME="$PREFIX-OriginVerifySecret"
GITHUB_ENV_NAME="$(config_get "$STAGE_CONFIG" Stack.Cicd.GitHubEnvironment)"
GITHUB_REPO="$(config_get "$STAGE_CONFIG" Stack.Cicd.GitHubRepo)"
APP_CONFIG_REL="$(node -e 'process.stdout.write(require("path").relative(process.cwd(), process.argv[1]))' "$STAGE_CONFIG")"

echo "==--------Stage $PREFIX---------=="
if aws ssm get-parameter --name "$SECRET_NAME" --region "$REGION" --query Parameter.Name --output text >/dev/null 2>&1; then
  echo "SSM parameter $SECRET_NAME already exists, keeping it."
else
  # Plain String on purpose: the value also sits in the CloudFront and Lambda configs, so SecureString adds nothing.
  aws ssm put-parameter --name "$SECRET_NAME" --type String --region "$REGION" \
    --description "CloudFront -> API origin verify header for $PREFIX" \
    --value "$(openssl rand -hex 32)" >/dev/null
  echo "Created SSM parameter $SECRET_NAME."
fi

# With this shell's credentials (CliCredentialsStackSynthesizer): CI and the exec role cannot change this role.
npx cdk deploy "$PREFIX-Cicd" "${APPROVAL[@]}" -c APP_CONFIG="$STAGE_CONFIG"

ROLE_ARN="$(aws ssm get-parameter --name "$PREFIX-DeployRoleArn" --region "$REGION" --query Parameter.Value --output text)"
GITHUB_SETUP+="
GitHub environment '$GITHUB_ENV_NAME' (repo $GITHUB_REPO -> Settings -> Environments), variables:
  AWS_DEPLOY_ROLE_ARN = $ROLE_ARN
  AWS_REGION          = $REGION
  AWS_ACCOUNT_ID      = $ACCOUNT
  APP_CONFIG          = $APP_CONFIG_REL
or with the GitHub CLI:
  gh variable set AWS_DEPLOY_ROLE_ARN --repo $GITHUB_REPO --env $GITHUB_ENV_NAME --body '$ROLE_ARN'
  gh variable set AWS_REGION          --repo $GITHUB_REPO --env $GITHUB_ENV_NAME --body '$REGION'
  gh variable set AWS_ACCOUNT_ID      --repo $GITHUB_REPO --env $GITHUB_ENV_NAME --body '$ACCOUNT'
  gh variable set APP_CONFIG          --repo $GITHUB_REPO --env $GITHUB_ENV_NAME --body '$APP_CONFIG_REL'
"
echo

echo "==--------GitHubEnvironments---------=="
echo "$GITHUB_SETUP"
