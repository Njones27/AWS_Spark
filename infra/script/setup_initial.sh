#!/usr/bin/env bash
# One-time (per account) setup, run by hand from a shell with admin credentials for the account.
# Adapted from aws-samples/aws-cdk-project-template-for-devops script/setup_initial.sh.
#
#   infra/script/setup_initial.sh config/app-config-account.json config/app-config-dev.json config/app-config-prod.json
#
# 1. checks the account's Lambda concurrency quota against what the stage configs reserve (warns, never stops)
# 2. builds the frontend (every cdk command synthesizes the Web stack, which uploads dist/)
# 3. cdk bootstrap aws://<account>/<region>
# 4. deploys the account config (GitHub OIDC provider, budgets)
# 5. per stage: creates the <Project>-<Stage>-OriginVerifySecret SSM parameter (once), deploys <Project>-<Stage>-Cicd,
#    prints the GitHub environment variables to set
#
# Dependencies are not installed here: run `npm ci` at the repo root first. Safe to re-run.
set -euo pipefail

if [ "$#" -lt 2 ]; then
  echo "Usage: $0 <account-config.json> <stage-config.json> [<stage-config.json>...]" >&2
  exit 64
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"

ACCOUNT_CONFIG="$(abspath "$1")"
shift
STAGE_CONFIGS=()
for cfg in "$@"; do STAGE_CONFIGS+=("$(abspath "$cfg")"); done

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

for cfg in "${STAGE_CONFIGS[@]}"; do
  if [ "$(config_get "$cfg" Project.Account)" != "$ACCOUNT" ] || [ "$(config_get "$cfg" Project.Region)" != "$REGION" ]; then
    echo "$cfg targets a different account or region than $ACCOUNT_CONFIG; run this script once per account." >&2
    exit 1
  fi
done

echo "==--------LambdaConcurrencyQuota---------=="
# Lambda refuses a reserved concurrency that would leave less than 100 unreserved in the account.
QUOTA="$(aws lambda get-account-settings --region "$REGION" --query AccountLimit.ConcurrentExecutions --output text)"
echo "ConcurrentExecutions quota in $REGION: $QUOTA"
RESERVED_TOTAL=0
RESERVED_LINES=""
for cfg in "${STAGE_CONFIGS[@]}"; do
  reserved="$(config_get "$cfg" Stack.Api.ReservedConcurrency)"
  reserved="${reserved:-0}"
  RESERVED_TOTAL=$((RESERVED_TOTAL + reserved))
  RESERVED_LINES+="  $(config_get "$cfg" Project.Name)-$(config_get "$cfg" Project.Stage): Api.ReservedConcurrency = $reserved ($cfg)
"
done
NEEDED=$((RESERVED_TOTAL + 100))
if [ "$QUOTA" -lt "$NEEDED" ]; then
  cat <<WARN
WARNING: the quota ($QUOTA) is below the stage reservations plus the 100 Lambda keeps unreserved ($NEEDED).
A stage that reserves concurrency will fail to deploy until the quota is raised:
$RESERVED_LINES
Request the default quota, then deploy that stage once it is granted:
  aws service-quotas request-service-quota-increase --region $REGION \\
    --service-code lambda --quota-code L-B99A9384 --desired-value 1000
A stage with ReservedConcurrency 0 deploys fine in the meantime. Continuing.
WARN
else
  echo "OK: covers the stage reservations ($RESERVED_TOTAL) plus 100 unreserved."
fi
echo

echo "==--------BuildFrontend---------=="
(cd .. && npm run build)
echo

echo "==--------BootstrapCDKEnvironment---------=="
APP_CONFIG="$ACCOUNT_CONFIG" npx cdk bootstrap "aws://$ACCOUNT/$REGION" -c APP_CONFIG="$ACCOUNT_CONFIG"
echo

echo "==--------DeployAccountStacks---------=="
npx cdk deploy --all "${APPROVAL[@]}" -c APP_CONFIG="$ACCOUNT_CONFIG"
echo

GITHUB_SETUP=""
for cfg in "${STAGE_CONFIGS[@]}"; do
  PREFIX="$(config_get "$cfg" Project.Name)-$(config_get "$cfg" Project.Stage)"
  SECRET_NAME="$PREFIX-OriginVerifySecret"
  GITHUB_ENV_NAME="$(config_get "$cfg" Stack.Cicd.GitHubEnvironment)"
  GITHUB_REPO="$(config_get "$cfg" Stack.Cicd.GitHubRepo)"
  APP_CONFIG_REL="$(node -e 'process.stdout.write(require("path").relative(process.cwd(), process.argv[1]))' "$cfg")"

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

  npx cdk deploy "$PREFIX-Cicd" "${APPROVAL[@]}" -c APP_CONFIG="$cfg"

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
done

echo "==--------GitHubEnvironments---------=="
echo "$GITHUB_SETUP"
