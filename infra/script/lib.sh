# Shared helpers for the infra scripts. Sourced, not run.
# Config values are read with node (already required for CDK), so jq is not needed.

# Absolute path of a file, resolved against the caller's working directory.
abspath() {
  node -e 'process.stdout.write(require("path").resolve(process.argv[1]))' "$1"
}

# config_get <config.json> <dotted.key>  -> prints the value ('' when missing)
config_get() {
  node -e '
    const config = require(process.argv[1]);
    const value = process.argv[2].split(".").reduce((o, k) => (o == null ? undefined : o[k]), config);
    process.stdout.write(value == null ? "" : String(value));
  ' "$1" "$2"
}

# use_profile <config.json>: export AWS_PROFILE when the config names one (cdk and aws both honour it).
use_profile() {
  local profile
  profile="$(config_get "$1" Project.Profile)"
  if [ -n "$profile" ]; then
    export AWS_PROFILE="$profile"
    echo "Using AWS profile: $AWS_PROFILE"
  fi
}

# The stage stacks CI deploys. Cicd is left out on purpose: it holds the role CI runs as, so only
# setup_initial.sh changes it. Keep in step with .github/workflows/deploy-stage.yml.
stage_stack_patterns() {
  local prefix="$1"
  echo "$prefix-Data $prefix-Api $prefix-Web $prefix-Ops"
}

# require_account <config.json>: stop unless the current credentials belong to the config's account.
require_account() {
  local expected actual
  expected="$(config_get "$1" Project.Account)"
  if ! actual="$(aws sts get-caller-identity --query Account --output text)"; then
    echo "No valid AWS credentials${AWS_PROFILE:+ for profile $AWS_PROFILE}. For an SSO profile run: aws sso login${AWS_PROFILE:+ --profile $AWS_PROFILE}" >&2
    exit 1
  fi
  if [ "$actual" != "$expected" ]; then
    echo "Credentials are for account $actual but $1 targets $expected. Fix the profile or the config." >&2
    exit 1
  fi
}
