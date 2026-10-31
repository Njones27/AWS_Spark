// Every IAM role this app creates carries the `Spark-RoleBoundary` permissions boundary. The CDK bootstrap's
// CloudFormation execution role is bootstrapped with infra/policies/cfn-exec-policy.json, which only lets it create
// `Spark-*` roles that have this boundary, so no deploy can mint a role more powerful than the boundary allows.
// Both managed policies are created by script/setup_initial.sh from infra/policies/*.json. See infra/README.md,
// "Least-privilege bootstrap".

import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';

/** Customer-managed policy used as the permissions boundary of every app role (infra/policies/role-boundary.json). */
export const ROLE_BOUNDARY_POLICY_NAME = 'Spark-RoleBoundary';
/** Customer-managed policy attached to the CDK CloudFormation execution role (infra/policies/cfn-exec-policy.json). */
export const CFN_EXEC_POLICY_NAME = 'Spark-CdkCfnExec';
/** The exec policy only allows creating and changing roles whose names start with this. */
export const ROLE_NAME_PREFIX = 'Spark-';

/**
 * Adds the boundary to every `AWS::IAM::Role` in every stack of the app. `iam.PermissionsBoundary` is an aspect that
 * matches on the CloudFormation type, so it also covers roles created as plain `CfnResource`s, such as the
 * autoDeleteObjects custom resource provider role, not just `iam.Role`. It is applied per stack so the ARN uses that
 * stack's own account.
 */
export function applyRoleBoundary(app: cdk.App): void {
    for (const stack of app.node.children.filter((child): child is cdk.Stack => cdk.Stack.isStack(child))) {
        const boundary = iam.ManagedPolicy.fromManagedPolicyName(stack, 'SparkRoleBoundary', ROLE_BOUNDARY_POLICY_NAME);
        iam.PermissionsBoundary.of(stack).apply(boundary);
    }
}
