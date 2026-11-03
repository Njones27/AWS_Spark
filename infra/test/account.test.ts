import { describe, expect, it } from 'vitest';
import { Match } from 'aws-cdk-lib/assertions';

import { ACCOUNTS, configPath, stackIds, synthConfig, templateOf, writeConfigCopy } from './helpers';

// One account config per AWS account: dev and prod live in separate AWS Organizations member accounts.
describe.each([
    { name: 'account-dev' as const, account: ACCOUNTS.dev, profile: 'spark-dev' },
    { name: 'account-prod' as const, account: ACCOUNTS.prod, profile: 'spark-prod' },
])('$name config', ({ name, account, profile }) => {
    const result = synthConfig(configPath(name));
    const template = templateOf(result.stacks.gitHubOidc);

    it('creates only the GitHubOidc stack, in its own account', () => {
        expect(stackIds(result)).toEqual(['Spark-Account-GitHubOidc']);
        expect(result.appContext.stackCommonProps.env).toEqual({ account, region: 'us-east-1' });
        expect(result.appContext.appConfig.Project.Profile).toBe(profile);
    });

    it('creates the GitHub OIDC provider for sts.amazonaws.com (a new account has none)', () => {
        template.resourceCountIs('AWS::IAM::OIDCProvider', 1);
        template.hasResourceProperties('AWS::IAM::OIDCProvider', {
            Url: 'https://token.actions.githubusercontent.com',
            ClientIdList: ['sts.amazonaws.com'],
        });
        template.hasOutput('GitHubOidcProviderArn', {});
    });

    it('creates the monthly budgets, each emailing the account alert address from SSM at 100% of actual spend', () => {
        template.resourceCountIs('AWS::Budgets::Budget', 2);
        for (const limit of [10, 25]) {
            template.hasResourceProperties('AWS::Budgets::Budget', {
                Budget: Match.objectLike({ BudgetLimit: { Amount: limit, Unit: 'USD' }, TimeUnit: 'MONTHLY', BudgetType: 'COST' }),
                NotificationsWithSubscribers: [{
                    Notification: { NotificationType: 'ACTUAL', ComparisonOperator: 'GREATER_THAN', Threshold: 100, ThresholdType: 'PERCENTAGE' },
                    Subscribers: [{ SubscriptionType: 'EMAIL', Address: { Ref: Match.stringLikeRegexp('SparkAccountAlertEmail') } }],
                }],
            });
        }
        // Resolved from SSM at deploy time: the address itself never appears in the template or the repo.
        const params = template.toJSON().Parameters ?? {};
        expect(Object.values(params).map((p: any) => p.Default)).toContain('Spark-Account-AlertEmail');
        expect(JSON.stringify(template.toJSON())).not.toMatch(/@/);
    });

    it('can import an existing provider', () => {
        const providerArn = `arn:aws:iam::${account}:oidc-provider/token.actions.githubusercontent.com`;
        const file = writeConfigCopy(name, (config) => {
            config.Stack.GitHubOidc.CreateProvider = false;
            config.Stack.GitHubOidc.ExistingProviderArn = providerArn;
        });

        const imported = templateOf(synthConfig(file).stacks.gitHubOidc);
        imported.resourceCountIs('AWS::IAM::OIDCProvider', 0);
        imported.hasOutput('GitHubOidcProviderArn', { Value: providerArn });
    });
});

describe('account and stage configs', () => {
    it('pair up: each stage config targets the same account, region and profile as its account config', () => {
        for (const stage of ['dev', 'prod'] as const) {
            const accountProject = synthConfig(configPath(`account-${stage}`)).appContext.appConfig.Project;
            const stageProject = synthConfig(configPath(stage)).appContext.appConfig.Project;
            expect(stageProject.Account).toBe(ACCOUNTS[stage]);
            expect({ ...stageProject, Stage: 'Account' }).toEqual(accountProject);
        }
        expect(ACCOUNTS.dev).not.toBe(ACCOUNTS.prod);
    });
});
