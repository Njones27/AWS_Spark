// Per-stage IAM role that GitHub Actions assumes through OIDC. It may only hand the deploy over to the CDK
// bootstrap roles (plus read one SSM parameter for the smoke test), so CI is bounded by what `cdk deploy` can do.
// Deployed by hand by script/setup_initial.sh, never by CI (a bad trust policy would lock CI out of itself).

import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';

import { AppContext } from '../lib/template/app-context';
import { StackConfig } from '../lib/template/app-config';
import { BaseStack } from '../lib/template/stack/base/base-stack';
import { configString } from '../lib/config-values';

/** Default CDK bootstrap qualifier (`cdk bootstrap` without `--qualifier`). */
const CDK_QUALIFIER = 'hnb659fds';

export class CicdStack extends BaseStack {
    public readonly deployRole: iam.Role;

    constructor(appContext: AppContext, stackConfig: StackConfig) {
        super(appContext, stackConfig);

        const repo = configString(stackConfig, 'GitHubRepo');
        const environment = configString(stackConfig, 'GitHubEnvironment');
        if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error(`[config] Cicd.GitHubRepo must be owner/name (got ${repo})`);
        if (environment.length === 0) throw new Error('[config] Cicd.GitHubEnvironment is required');

        // The provider ARN is deterministic per account, so no cross-stack lookup is needed.
        const providerArn = `arn:aws:iam::${this.account}:oidc-provider/token.actions.githubusercontent.com`;

        const cdkRoleArns = ['deploy', 'file-publishing', 'image-publishing', 'lookup'].map(
            (kind) => `arn:aws:iam::${this.account}:role/cdk-${CDK_QUALIFIER}-${kind}-role-${this.account}-${this.region}`,
        );

        this.deployRole = new iam.Role(this, 'GitHubDeployRole', {
            roleName: this.withProjectPrefix('GitHubDeploy'),
            description: `GitHub Actions deploy role for ${repo}, environment ${environment}`,
            maxSessionDuration: cdk.Duration.hours(2),
            assumedBy: new iam.WebIdentityPrincipal(providerArn, {
                StringEquals: { 'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com' },
                StringLike: { 'token.actions.githubusercontent.com:sub': `repo:${repo}:environment:${environment}` },
            }),
            inlinePolicies: {
                CdkDeploy: new iam.PolicyDocument({
                    statements: [
                        new iam.PolicyStatement({
                            sid: 'AssumeCdkBootstrapRoles',
                            actions: ['sts:AssumeRole'],
                            resources: cdkRoleArns,
                        }),
                        new iam.PolicyStatement({
                            sid: 'ReadCdkBootstrapVersion',
                            actions: ['ssm:GetParameter'],
                            resources: [`arn:aws:ssm:${this.region}:${this.account}:parameter/cdk-bootstrap/${CDK_QUALIFIER}/version`],
                        }),
                        // The deploy workflow's smoke test looks up the CloudFront domain it just deployed.
                        new iam.PolicyStatement({
                            sid: 'ReadSmokeTestTarget',
                            actions: ['ssm:GetParameter'],
                            resources: [`arn:aws:ssm:${this.region}:${this.account}:parameter/${this.withProjectPrefix('DistributionDomain')}`],
                        }),
                    ],
                }),
            },
        });

        this.putParameter('DeployRoleArn', this.deployRole.roleArn);
        new cdk.CfnOutput(this, 'DeployRoleArnOutput', { value: this.deployRole.roleArn });
    }
}
