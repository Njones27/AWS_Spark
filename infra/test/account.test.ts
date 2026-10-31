import { describe, expect, it } from 'vitest';
import { Match } from 'aws-cdk-lib/assertions';

import { configPath, stackIds, synthConfig, templateOf, writeConfigCopy } from './helpers';

describe('account config', () => {
    const result = synthConfig(configPath('account'));
    const template = templateOf(result.stacks.gitHubOidc);

    it('creates only the GitHubOidc stack', () => {
        expect(stackIds(result)).toEqual(['Spark-Account-GitHubOidc']);
    });

    it('imports the account\'s existing GitHub OIDC provider instead of creating one', () => {
        template.resourceCountIs('AWS::IAM::OIDCProvider', 0);
        template.hasOutput('GitHubOidcProviderArn', {
            Value: 'arn:aws:iam::179326015123:oidc-provider/token.actions.githubusercontent.com',
        });
    });

    it('creates the GitHub OIDC provider for sts.amazonaws.com when CreateProvider is true', () => {
        const file = writeConfigCopy('account', (config) => {
            config.Stack.GitHubOidc.CreateProvider = true;
            config.Stack.GitHubOidc.ExistingProviderArn = '';
        });
        const created = templateOf(synthConfig(file).stacks.gitHubOidc);
        created.resourceCountIs('AWS::IAM::OIDCProvider', 1);
        created.hasResourceProperties('AWS::IAM::OIDCProvider', {
            Url: 'https://token.actions.githubusercontent.com',
            ClientIdList: ['sts.amazonaws.com'],
        });
        created.hasOutput('GitHubOidcProviderArn', {});
    });

    it('creates the monthly budgets without notifications while BudgetEmail is empty', () => {
        template.resourceCountIs('AWS::Budgets::Budget', 2);
        for (const limit of [10, 25]) {
            template.hasResourceProperties('AWS::Budgets::Budget', {
                Budget: Match.objectLike({ BudgetLimit: { Amount: limit, Unit: 'USD' }, TimeUnit: 'MONTHLY', BudgetType: 'COST' }),
                NotificationsWithSubscribers: Match.absent(),
            });
        }
    });

    it('adds an ACTUAL > 100% email notification once BudgetEmail is set, and can import an existing provider', () => {
        const file = writeConfigCopy('account', (config) => {
            config.Stack.GitHubOidc.BudgetEmail = 'owner@example.com';
            config.Stack.GitHubOidc.CreateProvider = false;
            config.Stack.GitHubOidc.ExistingProviderArn = 'arn:aws:iam::179326015123:oidc-provider/token.actions.githubusercontent.com';
        });

        const withEmail = templateOf(synthConfig(file).stacks.gitHubOidc);
        withEmail.resourceCountIs('AWS::IAM::OIDCProvider', 0);
        withEmail.hasResourceProperties('AWS::Budgets::Budget', {
            NotificationsWithSubscribers: [{
                Notification: { NotificationType: 'ACTUAL', ComparisonOperator: 'GREATER_THAN', Threshold: 100, ThresholdType: 'PERCENTAGE' },
                Subscribers: [{ SubscriptionType: 'EMAIL', Address: 'owner@example.com' }],
            }],
        });
    });
});
