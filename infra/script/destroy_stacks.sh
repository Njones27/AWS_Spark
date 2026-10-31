#!/usr/bin/env bash
# Tears down every stack of one config (all stages stacks including Cicd, or the account stack).
# Adapted from aws-samples/aws-cdk-project-template-for-devops script/destroy_stacks.sh.
#
#   infra/script/destroy_stacks.sh config/app-config-dev.json
#
# Kept on purpose, delete by hand when sure:
# - prod's DynamoDB table (RemovalPolicy RETAIN + deletion protection) and prod's site bucket (RETAIN)
# - the <Project>-<Stage>-OriginVerifySecret SSM parameter (created by setup_initial.sh, not by CDK)
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <config.json>" >&2
  exit 64
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"

APP_CONFIG="$(abspath "$1")"
export APP_CONFIG
STAGE="$(config_get "$APP_CONFIG" Project.Stage)"
PREFIX="$(config_get "$APP_CONFIG" Project.Name)-$STAGE"
ACCOUNT="$(config_get "$APP_CONFIG" Project.Account)"
REGION="$(config_get "$APP_CONFIG" Project.Region)"
use_profile "$APP_CONFIG"
require_account "$APP_CONFIG"

cd "$SCRIPT_DIR/.."   # infra/

echo "==--------ListStacks---------=="
npx cdk list -c APP_CONFIG="$APP_CONFIG"
echo

echo "This destroys every stack above in account $ACCOUNT ($REGION)."
read -r -p "Type the stage name ($STAGE) to continue: " ANSWER
if [ "$ANSWER" != "$STAGE" ]; then
  echo "Aborted." >&2
  exit 1
fi

echo "==--------DestroyStacks---------=="
npx cdk destroy --all --force -c APP_CONFIG="$APP_CONFIG"
echo

echo "Left in place on purpose:"
if [ "$(config_get "$APP_CONFIG" Stack.Data.RetainOnDelete)" = "true" ]; then
  echo "- the $PREFIX DynamoDB table (retained, deletion protection on). After 30 days, if unneeded:"
  echo "    aws dynamodb update-table --table-name <name> --no-deletion-protection-enabled --region $REGION"
  echo "    aws dynamodb delete-table --table-name <name> --region $REGION"
fi
if [ "$(echo "$STAGE" | tr '[:upper:]' '[:lower:]')" = "prod" ]; then
  echo "- the $PREFIX site bucket (retained): empty and delete it in the S3 console once unneeded."
fi
if [ -n "$(config_get "$APP_CONFIG" Stack.Api.Name)" ]; then
  echo "- SSM parameter $PREFIX-OriginVerifySecret:"
  echo "    aws ssm delete-parameter --name $PREFIX-OriginVerifySecret --region $REGION"
fi
