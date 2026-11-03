// Account-level stack (config/app-config-account-<dev|prod>.json): the GitHub Actions OIDC provider and the AWS Budgets.
// Deployed by hand once per account by script/setup_initial.sh, never by CI, with the caller's own credentials
// (CliCredentialsStackSynthesizer): the CDK exec role is denied every OIDC provider write.

import * as cdk from 'aws-cdk-lib';
import * as budgets from 'aws-cdk-lib/aws-budgets';
import * as iam from 'aws-cdk-lib/aws-iam';

import { AppContext } from '../lib/template/app-context';
import { StackConfig } from '../lib/template/app-config';
import { BaseStack } from '../lib/template/stack/base/base-stack';
import { configBoolean, configNumberList, configString } from '../lib/config-values';
import { ALERT_EMAIL_KEY } from '../lib/metrics';

export const GITHUB_OIDC_URL = 'https://token.actions.githubusercontent.com';

export class GitHubOidcStack extends BaseStack {
    public readonly provider: iam.IOidcProvider;

    constructor(appContext: AppContext, stackConfig: StackConfig) {
        super(appContext, stackConfig, { synthesizer: new cdk.CliCredentialsStackSynthesizer() });

        // An account can hold only one provider per URL: set CreateProvider false to import an existing one.
        if (configBoolean(stackConfig, 'CreateProvider')) {
            this.provider = new iam.OidcProviderNative(this, 'GitHubOidc', {
                url: GITHUB_OIDC_URL,
                clientIds: ['sts.amazonaws.com'],
            });
        } else {
            const existingArn = configString(stackConfig, 'ExistingProviderArn');
            if (existingArn.length === 0) {
                throw new Error('[config] GitHubOidc.ExistingProviderArn is required when CreateProvider is false');
            }
            this.provider = iam.OidcProviderNative.fromOidcProviderArn(this, 'GitHubOidc', existingArn);
        }

        // Monthly cost budgets (free without actions), each emailing the account's alert address once actual spend
        // passes 100%. The address is the `<Project>-Account-AlertEmail` SSM parameter that setup_initial.sh writes
        // before deploying this stack, so it never sits in the public repo.
        const alertEmail = this.getParameter(ALERT_EMAIL_KEY);
        for (const limit of configNumberList(stackConfig, 'BudgetLimitsUsd')) {
            new budgets.CfnBudget(this, `MonthlyBudget${limit}Usd`, {
                budget: {
                    budgetName: `${this.projectPrefix}-Monthly-${limit}USD`,
                    budgetType: 'COST',
                    timeUnit: 'MONTHLY',
                    budgetLimit: { amount: limit, unit: 'USD' },
                },
                notificationsWithSubscribers: [{
                    notification: {
                        notificationType: 'ACTUAL',
                        comparisonOperator: 'GREATER_THAN',
                        threshold: 100,
                        thresholdType: 'PERCENTAGE',
                    },
                    subscribers: [{ subscriptionType: 'EMAIL', address: alertEmail }],
                }],
            });
        }

        new cdk.CfnOutput(this, 'GitHubOidcProviderArn', { value: this.provider.openIdConnectProviderArn });
    }
}
