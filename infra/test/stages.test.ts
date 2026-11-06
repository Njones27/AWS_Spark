import { describe, expect, it } from 'vitest';
import { Match } from 'aws-cdk-lib/assertions';

import { API_ROUTES } from '../stack/api-stack';
import { CONTENT_SECURITY_POLICY } from '../stack/web-stack';
import { ACCOUNTS, configPath, onlyResource, stackIds, synthConfig, templateOf, writeConfigCopy } from './helpers';

const expectations = {
    dev: {
        account: ACCOUNTS.dev, prefix: 'Spark-Dev', namespace: 'Spark/Dev', rate: 20, burst: 50,
        routeRates: { 'POST /api/profiles': 5, 'POST /api/profiles/recover': 5, 'POST /api/shares': 2, 'PUT /api/profiles/me': 10 },
        reserved: undefined, retention: 14, pitr: false, retain: false, api5xx: 5, recoverMisses: 50,
        domain: 'dev.letslearncloud.com',
    },
    prod: {
        account: ACCOUNTS.prod, prefix: 'Spark-Prod', namespace: 'Spark/Prod', rate: 500, burst: 1000,
        routeRates: { 'POST /api/profiles': 20, 'POST /api/profiles/recover': 5, 'POST /api/shares': 10, 'PUT /api/profiles/me': 200 },
        reserved: 0, retention: 30, pitr: true, retain: true, api5xx: 1, recoverMisses: 200,
        domain: 'letslearncloud.com',
    },
} as const;

describe.each(Object.entries(expectations))('%s config', (stage, want) => {
    const result = synthConfig(configPath(stage as 'dev' | 'prod'));
    const { stacks } = result;

    it('creates the five stage stacks, ordered Data -> Api -> Web -> Ops', () => {
        expect(stackIds(result)).toEqual(['Cicd', 'Data', 'Api', 'Web', 'Ops'].map((s) => `${want.prefix}-${s}`));
        expect(stacks.api!.dependencies).toEqual([stacks.data]);
        expect(stacks.web!.dependencies).toEqual([stacks.api]);
        expect(stacks.ops!.dependencies).toEqual([stacks.web]);
        expect(stacks.cicd!.dependencies).toEqual([]);
    });

    describe('Cicd', () => {
        const template = templateOf(stacks.cicd);

        it('trusts only this repo and GitHub environment through the account OIDC provider', () => {
            // Exact subject in GitHub's immutable format (owner and repo ids), no wildcard.
            template.hasResourceProperties('AWS::IAM::Role', {
                RoleName: `${want.prefix}-GitHubDeploy`,
                MaxSessionDuration: 7200,
                AssumeRolePolicyDocument: {
                    Statement: [Match.objectLike({
                        Action: 'sts:AssumeRoleWithWebIdentity',
                        Principal: { Federated: `arn:aws:iam::${want.account}:oidc-provider/token.actions.githubusercontent.com` },
                        Condition: {
                            StringEquals: {
                                'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
                                'token.actions.githubusercontent.com:sub': `repo:Njones27@153565100/AWS_Spark@1437703955:environment:${stage}`,
                            },
                        },
                    })],
                },
            });
        });

        it('may only assume the CDK deploy and file-publishing roles and read two SSM parameters', () => {
            const role = onlyResource(template, 'AWS::IAM::Role');
            expect(role.Properties.ManagedPolicyArns).toBeUndefined();
            const statements = role.Properties.Policies[0].PolicyDocument.Statement;
            expect(statements.map((s: { Action: string }) => s.Action)).toEqual(['sts:AssumeRole', 'ssm:GetParameter', 'ssm:GetParameter']);
            // Only the deploy and file-publishing bootstrap roles: no lookups, no Docker assets.
            expect(statements[0].Resource).toEqual(['deploy', 'file-publishing'].map(
                (kind) => `arn:aws:iam::${want.account}:role/cdk-hnb659fds-${kind}-role-${want.account}-us-east-1`,
            ));
            expect(statements[1].Resource).toBe(`arn:aws:ssm:us-east-1:${want.account}:parameter/cdk-bootstrap/hnb659fds/version`);
            expect(statements[2].Resource).toBe(`arn:aws:ssm:us-east-1:${want.account}:parameter/${want.prefix}-DistributionDomain`);
        });
    });

    describe('Data', () => {
        const template = templateOf(stacks.data);

        it('has a pk/sk on-demand table with TTL', () => {
            template.hasResourceProperties('AWS::DynamoDB::Table', {
                KeySchema: [{ AttributeName: 'pk', KeyType: 'HASH' }, { AttributeName: 'sk', KeyType: 'RANGE' }],
                BillingMode: 'PAY_PER_REQUEST',
                TimeToLiveSpecification: { AttributeName: 'ttl', Enabled: true },
            });
        });

        it(`${want.pitr ? 'enables' : 'does not enable'} PITR and deletion protection`, () => {
            const table = onlyResource(template, 'AWS::DynamoDB::Table');
            expect(table.Properties.PointInTimeRecoverySpecification?.PointInTimeRecoveryEnabled ?? false).toBe(want.pitr);
            expect(table.Properties.DeletionProtectionEnabled ?? false).toBe(want.retain);
            expect(table.DeletionPolicy).toBe(want.retain ? 'Retain' : 'Delete');
        });

        it('publishes the table name and ARN to SSM', () => {
            template.hasResourceProperties('AWS::SSM::Parameter', { Name: `${want.prefix}-TableName` });
            template.hasResourceProperties('AWS::SSM::Parameter', { Name: `${want.prefix}-TableArn` });
        });
    });

    describe('Api', () => {
        const template = templateOf(stacks.api);

        it(`runs the handler on Node 24, arm64, JSON logs, ${(want.reserved ?? 0) > 0 ? `reserving ${want.reserved}` : 'no reserved concurrency'}`, () => {
            template.hasResourceProperties('AWS::Lambda::Function', {
                Runtime: 'nodejs24.x',
                Architectures: ['arm64'],
                MemorySize: 512,
                Timeout: 10,
                ReservedConcurrentExecutions: (want.reserved ?? 0) > 0 ? want.reserved : Match.absent(),
                LoggingConfig: Match.objectLike({ LogFormat: 'JSON' }),
                Environment: {
                    Variables: Match.objectLike({
                        STAGE: stage,
                        TABLE_NAME: { Ref: Match.stringLikeRegexp('TableName') },
                        ORIGIN_VERIFY_SECRET: { Ref: Match.stringLikeRegexp('OriginVerifySecret') },
                        BUILDER_KEY_PEPPER: { Ref: Match.stringLikeRegexp('BuilderKeyPepper') },
                    }),
                },
            });
        });

        it('exposes exactly the nine contract routes, without CORS', () => {
            const routeKeys = Object.values(template.findResources('AWS::ApiGatewayV2::Route')).map((r) => r.Properties.RouteKey);
            expect(routeKeys.sort()).toEqual(API_ROUTES.map((r) => `${r.method} ${r.path}`).sort());
            expect(routeKeys).toHaveLength(9);
            expect(routeKeys).toEqual(expect.arrayContaining(['DELETE /api/profiles/me', 'POST /api/profiles/me/key']));
            template.hasResourceProperties('AWS::ApiGatewayV2::Api', { CorsConfiguration: Match.absent() });
        });

        it('throttles the stage, and the write routes tighter (burst 2x rate)', () => {
            const stageProps = onlyResource(template, 'AWS::ApiGatewayV2::Stage').Properties;
            expect(stageProps.DefaultRouteSettings).toEqual({ ThrottlingRateLimit: want.rate, ThrottlingBurstLimit: want.burst });
            expect(stageProps.RouteSettings).toEqual(Object.fromEntries(Object.entries(want.routeRates).map(([route, rate]) => [
                route, { ThrottlingRateLimit: rate, ThrottlingBurstLimit: rate * 2 },
            ])));
            expect(stageProps.AccessLogSettings.Format).toMatch(/requestId/);
        });

        it('grants the function only the table actions the store sends', () => {
            const policies = Object.values(template.findResources('AWS::IAM::Policy')).map((r) => r.Properties.PolicyDocument.Statement).flat();
            const table = policies.find((st: { Sid?: string }) => st.Sid === 'TableReadWrite');
            expect([...table.Action].sort()).toEqual([
                'dynamodb:ConditionCheckItem', 'dynamodb:DeleteItem', 'dynamodb:GetItem',
                'dynamodb:PutItem', 'dynamodb:TransactWriteItems', 'dynamodb:UpdateItem',
            ]);
        });

        it('counts Builder Keys that matched nobody and throttled requests from the access logs', () => {
            for (const [pattern, metric] of [
                ['{ ($.routeKey = "POST /api/profiles/recover") && ($.status = "404") }', 'RecoverMisses'],
                ['{ $.status = "429" }', 'ApiThrottled'],
            ]) {
                template.hasResourceProperties('AWS::Logs::MetricFilter', {
                    FilterPattern: pattern,
                    LogGroupName: { Ref: Match.stringLikeRegexp('ApiAccessLogs') },
                    MetricTransformations: [{ MetricNamespace: want.namespace, MetricName: metric, MetricValue: '1' }],
                });
            }
        });

        it('counts logged error lines into a custom metric', () => {
            template.hasResourceProperties('AWS::Logs::MetricFilter', {
                FilterPattern: '{ ($.level = "ERROR") || ($.level = "error") }',
                LogGroupName: { Ref: Match.stringLikeRegexp('ApiFunctionLogs') },
                MetricTransformations: [{ MetricNamespace: want.namespace, MetricName: 'ApiLoggedErrors', MetricValue: '1' }],
            });
        });

        it(`keeps logs for ${want.retention} days`, () => {
            template.resourcePropertiesCountIs('AWS::Logs::LogGroup', { RetentionInDays: want.retention }, 2);
        });
    });

    describe('Web', () => {
        const template = templateOf(stacks.web);

        it('keeps the bucket private', () => {
            template.hasResourceProperties('AWS::S3::Bucket', {
                PublicAccessBlockConfiguration: {
                    BlockPublicAcls: true,
                    BlockPublicPolicy: true,
                    IgnorePublicAcls: true,
                    RestrictPublicBuckets: true,
                },
            });
        });

        it('has exactly two behaviors (S3 default + /api/*) and no custom error responses', () => {
            const config = onlyResource(template, 'AWS::CloudFront::Distribution').Properties.DistributionConfig;
            expect(config.DefaultCacheBehavior).toBeDefined();
            expect(config.CacheBehaviors).toHaveLength(1);
            expect(config.CacheBehaviors[0]).toMatchObject({
                PathPattern: '/api/*',
                ViewerProtocolPolicy: 'https-only',
                CachePolicyId: '4135ea2d-6df8-44a3-9df3-4b5a84be39ad', // Managed-CachingDisabled
                OriginRequestPolicyId: 'b689b0a8-53d0-40ab-baf2-68738e2966ac', // Managed-AllViewerExceptHostHeader
            });
            expect(config.CustomErrorResponses).toBeUndefined();
            expect(config.HttpVersion).toBe('http2and3');
            expect(config.PriceClass).toBe('PriceClass_100');
            expect(config.DefaultRootObject).toBe('index.html');
        });

        it('sends the origin-verify header to the API origin only', () => {
            const origins = onlyResource(template, 'AWS::CloudFront::Distribution').Properties.DistributionConfig.Origins;
            const withHeader = origins.filter((o: { OriginCustomHeaders?: unknown[] }) => o.OriginCustomHeaders);
            expect(withHeader).toHaveLength(1);
            expect(withHeader[0].OriginCustomHeaders).toEqual([{
                HeaderName: 'x-origin-verify',
                HeaderValue: { Ref: expect.stringMatching(/OriginVerifySecret/) },
            }]);
        });

        it('sends HSTS, nosniff, frame DENY, referrer policy and an enforced CSP', () => {
            const policy = onlyResource(template, 'AWS::CloudFront::ResponseHeadersPolicy').Properties.ResponseHeadersPolicyConfig;
            expect(policy.SecurityHeadersConfig.StrictTransportSecurity).toMatchObject({ AccessControlMaxAgeSec: 63072000, IncludeSubdomains: true });
            expect(policy.SecurityHeadersConfig.ContentTypeOptions).toEqual({ Override: true });
            expect(policy.SecurityHeadersConfig.FrameOptions).toEqual({ FrameOption: 'DENY', Override: true });
            expect(policy.SecurityHeadersConfig.ReferrerPolicy.ReferrerPolicy).toBe('strict-origin-when-cross-origin');
            expect(policy.SecurityHeadersConfig.ContentSecurityPolicy).toEqual({ ContentSecurityPolicy: CONTENT_SECURITY_POLICY, Override: true });
            expect(policy.CustomHeadersConfig).toBeUndefined();
            for (const directive of ["frame-ancestors 'none'", "object-src 'none'", "script-src 'self'", "form-action 'self'"]) {
                expect(CONTENT_SECURITY_POLICY).toContain(directive);
            }
        });

        it('uploads hashed assets as immutable and entry files as revalidate, never pruning', () => {
            const deployments = Object.values(template.findResources('Custom::CDKBucketDeployment')).map((r) => r.Properties);
            expect(deployments).toHaveLength(2);
            const [assets, entry] = [
                deployments.find((d) => d.DestinationBucketKeyPrefix === 'assets/'),
                deployments.find((d) => d.DistributionPaths),
            ];
            expect(assets?.SystemMetadata).toEqual({ 'cache-control': 'public, max-age=31536000, immutable' });
            expect(entry?.SystemMetadata).toEqual({ 'cache-control': 'public, max-age=0, s-maxage=86400, must-revalidate' });
            expect(entry?.DistributionPaths).toEqual(['/*']);
            for (const d of deployments) expect(d.Prune).toBe(false);
        });

        it(`serves ${want.domain} with a DNS-validated certificate and A/AAAA aliases`, () => {
            template.hasResourceProperties('AWS::CertificateManager::Certificate', {
                DomainName: want.domain,
                ValidationMethod: 'DNS',
            });
            template.hasResourceProperties('AWS::CloudFront::Distribution', {
                DistributionConfig: Match.objectLike({ Aliases: [want.domain] }),
            });
            template.resourcePropertiesCountIs('AWS::Route53::RecordSet', { Type: 'A' }, 1);
            template.resourcePropertiesCountIs('AWS::Route53::RecordSet', { Type: 'AAAA' }, 1);
        });
    });

    describe('Ops', () => {
        const template = templateOf(stacks.ops);

        it('alarms on errors, throttles, 5xx and abuse signals, all to SNS', () => {
            const alarms = Object.values(template.findResources('AWS::CloudWatch::Alarm')).map((r) => r.Properties);
            expect(alarms.map((a) => a.MetricName).sort()).toEqual([
                '5xx', '5xxErrorRate', 'ApiLoggedErrors', 'ApiThrottled', 'Errors', 'RecoverMisses', 'Throttles',
            ]);
            for (const alarm of alarms) {
                expect(alarm.AlarmActions).toEqual([{ Ref: expect.stringMatching(/AlarmTopic/) }]);
                expect(alarm.ComparisonOperator).toBe('GreaterThanOrEqualToThreshold');
                expect(alarm.Period).toBe(300);
            }
            const byMetric = Object.fromEntries(alarms.map((a) => [a.MetricName, a]));
            expect(byMetric['5xx'].Threshold).toBe(want.api5xx);
            expect(byMetric.ApiLoggedErrors).toMatchObject({ Namespace: want.namespace, Threshold: 1, Statistic: 'Sum' });
            expect(byMetric.RecoverMisses).toMatchObject({ Namespace: want.namespace, Threshold: want.recoverMisses, Statistic: 'Sum' });
            expect(byMetric.ApiThrottled).toMatchObject({ Namespace: want.namespace, Threshold: 50, Statistic: 'Sum' });
        });

        it('emails the account alert address from SSM, never one written in the repo', () => {
            template.resourceCountIs('AWS::SNS::Subscription', 1);
            template.hasResourceProperties('AWS::SNS::Subscription', {
                Protocol: 'email',
                Endpoint: { Ref: Match.stringLikeRegexp('SparkAccountAlertEmail') },
            });
            const params = template.toJSON().Parameters ?? {};
            expect(Object.values(params).map((p: any) => p.Default)).toContain('Spark-Account-AlertEmail');
            template.resourceCountIs('AWS::CloudWatch::Dashboard', 1);
        });
    });
});

describe('config switches', () => {
    it('can send the CSP report-only again by setting Web.CspReportOnly, keeping the other headers', () => {
        const file = writeConfigCopy('prod', (config) => { config.Stack.Web.CspReportOnly = true; });
        const policy = onlyResource(templateOf(synthConfig(file).stacks.web), 'AWS::CloudFront::ResponseHeadersPolicy')
            .Properties.ResponseHeadersPolicyConfig;
        expect(policy.SecurityHeadersConfig.ContentSecurityPolicy).toBeUndefined();
        expect(policy.SecurityHeadersConfig.FrameOptions).toEqual({ FrameOption: 'DENY', Override: true });
        expect(policy.CustomHeadersConfig.Items).toEqual([
            { Header: 'Content-Security-Policy-Report-Only', Value: CONTENT_SECURITY_POLICY, Override: true },
        ]);
    });

    it('treats a missing Api.ReservedConcurrency like 0 (no reservation)', () => {
        const file = writeConfigCopy('prod', (config) => { delete config.Stack.Api.ReservedConcurrency; });
        templateOf(synthConfig(file).stacks.api).hasResourceProperties('AWS::Lambda::Function', {
            ReservedConcurrentExecutions: Match.absent(),
        });
    });

    it('creates no DNS records or certificate while DomainName is empty', () => {
        const file = writeConfigCopy('dev', (config) => {
            config.Stack.Web.DomainName = '';
            config.Stack.Web.HostedZoneId = '';
        });

        const template = templateOf(synthConfig(file).stacks.web);
        template.resourceCountIs('AWS::CertificateManager::Certificate', 0);
        template.resourceCountIs('AWS::Route53::RecordSet', 0);
        template.hasResourceProperties('AWS::CloudFront::Distribution', {
            DistributionConfig: Match.objectLike({ Aliases: Match.absent() }),
        });
    });
});
