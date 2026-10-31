// The CDK bootstrap's CloudFormation execution role runs with infra/policies/cfn-exec-policy.json and
// cfn-exec-web-ops-policy.json instead of AdministratorAccess, and every role the app creates carries the
// Spark-RoleBoundary permissions boundary (infra/policies/role-boundary.json). These tests keep the app, the policies
// and the boundary in step. When one fails after adding an AWS service or a resource, read infra/README.md,
// "Least-privilege bootstrap", for how to extend the policies.

import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

import { CFN_EXEC_POLICY_NAME, ROLE_BOUNDARY_POLICY_NAME, ROLE_NAME_PREFIX } from '../lib/permissions-boundary';
import { CONFIG_NAMES, ConfigName, INFRA_DIR, configPath, stacksOf, synthConfig, templateOf, writeConfigCopy } from './helpers';

const POLICY_DIR = path.join(INFRA_DIR, 'policies');
const EXEC_POLICY_FILES = { [CFN_EXEC_POLICY_NAME]: 'cfn-exec-policy.json', 'Spark-CdkCfnExecWebOps': 'cfn-exec-web-ops-policy.json' };
const BOUNDARY_FILE = 'role-boundary.json';
const README_HINT = 'see infra/README.md, "Least-privilege bootstrap"';

/** IAM's limit for a customer-managed policy, counted without whitespace. */
const MANAGED_POLICY_MAX_CHARS = 6144;

interface Statement {
    Sid?: string;
    Effect: 'Allow' | 'Deny';
    Action: string | string[];
    Resource: string | string[];
    Condition?: Record<string, Record<string, unknown>>;
}
interface PolicyDocument { Version: string; Statement: Statement[] }

const list = (value: string | string[] | undefined): string[] => (value === undefined ? [] : Array.isArray(value) ? value : [value]);

function readPolicy(file: string, account = '111122223333', region = 'us-east-1'): PolicyDocument {
    const text = fs.readFileSync(path.join(POLICY_DIR, file), 'utf8')
        .replaceAll('${ACCOUNT_ID}', account)
        .replaceAll('${REGION}', region);
    return JSON.parse(text) as PolicyDocument;
}

/** IAM-style match: `*` is any run of characters, `?` one character; actions match case-insensitively. */
function iamMatch(pattern: string, value: string, ignoreCase = false): boolean {
    const re = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
    return new RegExp(`^${re}$`, ignoreCase ? 'i' : '').test(value);
}

const allowActions = (doc: PolicyDocument) => doc.Statement.filter((s) => s.Effect === 'Allow').flatMap((s) => list(s.Action));
const execPolicies = Object.values(EXEC_POLICY_FILES).map((file) => readPolicy(file));
const execAllowActions = execPolicies.flatMap(allowActions);

type Resources = Record<string, { Type: string; Properties?: Record<string, any> }>;
interface SynthedStack { config: string; stackName: string; account: string; resources: Resources }

/**
 * Every stack of every shipped config, plus variants that switch on the optional resources (custom domain:
 * certificate and DNS records; alarm email: SNS subscription; budget email; an imported OIDC provider), so the
 * coverage checks also see resources the shipped configs leave out.
 */
function synthAll(): SynthedStack[] {
    const variants: Array<{ config: string; file: string }> = [
        ...CONFIG_NAMES.map((name) => ({ config: name, file: configPath(name) })),
        ...(['dev', 'prod'] as const).map((name) => ({
            config: `${name}+domain+email`,
            file: writeConfigCopy(name, (config) => {
                config.Stack.Web.DomainName = `${name}.spark.example.com`;
                config.Stack.Web.HostedZoneId = 'Z0123456789ABCDEFGHIJ';
                config.Stack.Ops.AlarmEmail = 'owner@example.com';
            }),
        })),
        ...(['account-dev', 'account-prod'] as ConfigName[]).map((name) => ({
            config: `${name}+email+imported-provider`,
            file: writeConfigCopy(name, (config) => {
                config.Stack.GitHubOidc.BudgetEmail = 'owner@example.com';
                config.Stack.GitHubOidc.CreateProvider = false;
                config.Stack.GitHubOidc.ExistingProviderArn = `arn:aws:iam::${config.Project.Account}:oidc-provider/token.actions.githubusercontent.com`;
            }),
        })),
    ];
    return variants.flatMap(({ config, file }) => stacksOf(synthConfig(file)).map((stack) => ({
        config,
        stackName: stack.stackName,
        account: stack.account,
        resources: templateOf(stack).toJSON().Resources as Resources,
    })));
}

const stacks = synthAll();
const roles = stacks.flatMap((stack) => Object.entries(stack.resources)
    .filter(([, r]) => r.Type === 'AWS::IAM::Role')
    .map(([logicalId, r]) => ({ stack, logicalId, props: r.Properties ?? {} })));

/**
 * The physical name CloudFormation generates for a resource without an explicit name: `<stack>-<logicalId>-<12 random>`,
 * cut to the 64 characters IAM allows by shortening the middle. Matches the names CloudFormation gave the Spark-Dev
 * roles in the retired single account (see the fixture below).
 */
function cfnGeneratedName(stackName: string, logicalId: string, max = 64): string {
    const suffix = '-XXXXXXXXXXXX';
    return `${stackName}-${logicalId}`.slice(0, max - suffix.length) + suffix;
}

describe('permissions boundary on every role', () => {
    it('covers the roles of every stack, including the custom resource provider roles', () => {
        const ids = roles.map((r) => r.logicalId);
        expect(ids).toEqual(expect.arrayContaining([
            'GitHubDeployRoleED73FD64',
            'ApiFunctionServiceRole52B9747B',
            'CustomCDKBucketDeployment8693BB64968944B69AAFB0CC9EB8756CServiceRole89A01265',
            'CustomS3AutoDeleteObjectsCustomResourceProviderRole3B1BD092',
        ]));
    });

    it.each(roles.map((r) => [`${r.stack.config} ${r.stack.stackName}/${r.logicalId}`, r] as const))('%s has Spark-RoleBoundary', (_, role) => {
        expect(role.props.PermissionsBoundary).toBe(`arn:aws:iam::${role.stack.account}:policy/${ROLE_BOUNDARY_POLICY_NAME}`);
    });

    it('creates no IAM users, groups or managed policies (the exec policy cannot create them)', () => {
        const forbidden = stacks.flatMap((s) => Object.values(s.resources).map((r) => r.Type))
            .filter((type) => ['AWS::IAM::User', 'AWS::IAM::Group', 'AWS::IAM::ManagedPolicy', 'AWS::IAM::InstanceProfile'].includes(type));
        expect(forbidden).toEqual([]);
    });
});

describe('role names stay inside the exec policy\'s role/Spark-* scope', () => {
    const roleWrite = readPolicy(EXEC_POLICY_FILES[CFN_EXEC_POLICY_NAME]).Statement.find((s) => list(s.Action).includes('iam:CreateRole'))!;
    const rolePattern = list(roleWrite.Resource)[0].split(':role/')[1];

    it('the exec policy scopes role writes to Spark-* and requires the boundary on them', () => {
        expect(rolePattern).toBe(`${ROLE_NAME_PREFIX}*`);
        expect(roleWrite.Condition).toEqual({
            StringEquals: { 'iam:PermissionsBoundary': `arn:aws:iam::111122223333:policy/${ROLE_BOUNDARY_POLICY_NAME}` },
        });
    });

    it('models CloudFormation\'s generated names the way they were observed', () => {
        // Names CloudFormation generated for the Spark-Dev stacks in the retired single account.
        expect(cfnGeneratedName('Spark-Dev-Api', 'ApiFunctionServiceRole52B9747B'))
            .toBe('Spark-Dev-Api-ApiFunctionServiceRole52B9747B-XXXXXXXXXXXX'); // observed ...-jtkunY4cPKY1
        expect(cfnGeneratedName('Spark-Dev-Web', 'CustomCDKBucketDeployment8693BB64968944B69AAFB0CC9EB8756CServiceRole89A01265'))
            .toBe('Spark-Dev-Web-CustomCDKBucketDeployment8693BB649689-XXXXXXXXXXXX'); // observed ...-dkbdHZ4JAVf2
        expect(cfnGeneratedName('Spark-Dev-Web', 'CustomS3AutoDeleteObjectsCustomResourceProviderRole3B1BD092'))
            .toBe('Spark-Dev-Web-CustomS3AutoDeleteObjectsCustomResour-XXXXXXXXXXXX'); // observed ...-mFrrt6cJLeIM
    });

    it.each(roles.map((r) => [`${r.stack.stackName}/${r.logicalId}`, r] as const))('%s gets a Spark-* name', (_, role) => {
        if (role.props.RoleName !== undefined) {
            expect(role.props.RoleName).toMatch(/^Spark-/);
            expect(iamMatch(rolePattern, role.props.RoleName)).toBe(true);
            return;
        }
        // No explicit RoleName: CloudFormation generates one that starts with the stack name. Keep stack names short
        // so the whole stack name (and with it the Spark- prefix) survives the 64-character cut.
        expect(role.stack.stackName.startsWith(ROLE_NAME_PREFIX)).toBe(true);
        expect(role.stack.stackName.length).toBeLessThanOrEqual(32);
        const generated = cfnGeneratedName(role.stack.stackName, role.logicalId);
        expect(generated.startsWith(`${role.stack.stackName}-`)).toBe(true);
        expect(iamMatch(rolePattern, generated)).toBe(true);
    });
});

describe('exec policy covers every resource type the app deploys', () => {
    /** CloudFormation service namespace -> IAM action prefix. Add a line here (and the actions) for a new service. */
    const IAM_PREFIX: Record<string, string> = {
        ApiGatewayV2: 'apigateway',
        Budgets: 'budgets',
        CertificateManager: 'acm',
        CloudFront: 'cloudfront',
        CloudWatch: 'cloudwatch',
        DynamoDB: 'dynamodb',
        IAM: 'iam',
        Lambda: 'lambda',
        Logs: 'logs',
        Route53: 'route53',
        S3: 's3',
        SNS: 'sns',
        SSM: 'ssm',
    };
    const types = [...new Set(stacks.flatMap((s) => Object.values(s.resources).map((r) => r.Type)))].sort();

    it('sees the optional resource types too', () => {
        expect(types).toEqual(expect.arrayContaining([
            'AWS::CertificateManager::Certificate', 'AWS::Route53::RecordSet', 'AWS::SNS::Subscription', 'AWS::IAM::OIDCProvider',
        ]));
    });

    it.each(types.filter((t) => t.startsWith('AWS::') && t !== 'AWS::CDK::Metadata'))('%s', (type) => {
        const service = type.split('::')[1];
        const prefix = IAM_PREFIX[service];
        expect(prefix, `${type}: no IAM prefix mapped for CloudFormation service ${service}; ${README_HINT}`).toBeDefined();
        expect(execAllowActions.some((a) => a.toLowerCase().startsWith(`${prefix}:`)),
            `${type}: no ${prefix}:* action in infra/policies/cfn-exec*.json; ${README_HINT}`).toBe(true);
    });

    it.each(types.filter((t) => t.startsWith('Custom::')))('%s is backed by a Spark-* Lambda the exec role may invoke', (type) => {
        for (const stack of stacks) {
            for (const r of Object.values(stack.resources).filter((x) => x.Type === type)) {
                const target = r.Properties?.ServiceToken?.['Fn::GetAtt']?.[0];
                expect(stack.resources[target]?.Type, `${type} in ${stack.stackName} must be backed by a Lambda function`).toBe('AWS::Lambda::Function');
            }
        }
        const invoke = execPolicies.flatMap((d) => d.Statement)
            .find((s) => s.Effect === 'Allow' && list(s.Action).includes('lambda:InvokeFunction'));
        expect(list(invoke?.Resource)).toEqual(['arn:aws:lambda:us-east-1:111122223333:function:Spark-*']);
    });
});

describe('role boundary permits what the app roles do', () => {
    // AWS-managed policies the app attaches, and the actions they grant (from the policy documents).
    const MANAGED_POLICY_ACTIONS: Record<string, string[]> = {
        AWSLambdaBasicExecutionRole: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
    };
    // Listed by the Api stack but not an IAM action: transactions are authorized per item (PutItem, UpdateItem, ...).
    const NOT_IAM_ACTIONS = ['dynamodb:TransactWriteItems'];
    const boundaryActions = allowActions(readPolicy(BOUNDARY_FILE));

    function actionsOf(stack: SynthedStack, logicalId: string, props: Record<string, any>): string[] {
        const refersToRole = (v: unknown) => JSON.stringify(v).includes(`"${logicalId}"`);
        const inline = (props.Policies ?? []).flatMap((p: any) => p.PolicyDocument.Statement);
        const attached = Object.values(stack.resources)
            .filter((r) => r.Type === 'AWS::IAM::Policy' && refersToRole(r.Properties?.Roles))
            .flatMap((r) => r.Properties!.PolicyDocument.Statement);
        // Resource policies naming the role (the autoDeleteObjects bucket policy) are still capped by the boundary.
        const granted = Object.values(stack.resources)
            .filter((r) => r.Type === 'AWS::S3::BucketPolicy')
            .flatMap((r) => r.Properties!.PolicyDocument.Statement)
            .filter((s: any) => s.Effect === 'Allow' && refersToRole(s.Principal));
        const fromManaged = (props.ManagedPolicyArns ?? []).flatMap((arn: unknown) => {
            const name = /:policy\/(?:service-role\/)?([\w+=,.@-]+)/.exec(JSON.stringify(arn))?.[1] ?? JSON.stringify(arn);
            expect(MANAGED_POLICY_ACTIONS[name], `managed policy ${name}: add its actions to MANAGED_POLICY_ACTIONS`).toBeDefined();
            return MANAGED_POLICY_ACTIONS[name];
        });
        return [...inline, ...attached, ...granted]
            .filter((s: any) => s.Effect === 'Allow')
            .flatMap((s: any) => list(s.Action))
            .concat(fromManaged);
    }

    it.each(roles.map((r) => [`${r.stack.config} ${r.stack.stackName}/${r.logicalId}`, r] as const))('%s', (_, role) => {
        const actions = actionsOf(role.stack, role.logicalId, role.props).filter((a) => !NOT_IAM_ACTIONS.includes(a));
        expect(actions.length).toBeGreaterThan(0);
        const uncovered = actions.filter((a) => !boundaryActions.some((pattern) => iamMatch(pattern, a, true)));
        expect(uncovered, `not allowed by infra/policies/${BOUNDARY_FILE}; ${README_HINT}`).toEqual([]);
    });
});

describe('policy files', () => {
    const files = [...Object.values(EXEC_POLICY_FILES), BOUNDARY_FILE];

    it.each(files)('%s parses, uses only ${ACCOUNT_ID}/${REGION} placeholders and fits a managed policy', (file) => {
        const raw = fs.readFileSync(path.join(POLICY_DIR, file), 'utf8');
        expect(raw.replaceAll('${ACCOUNT_ID}', '').replaceAll('${REGION}', '')).not.toContain('${');
        const doc = readPolicy(file, '166147842278', 'us-east-1');
        expect(doc.Version).toBe('2012-10-17');
        expect(JSON.stringify(doc).replace(/\s/g, '').length).toBeLessThanOrEqual(MANAGED_POLICY_MAX_CHARS);
        expect(new Set(doc.Statement.map((s) => s.Sid)).size).toBe(doc.Statement.length);
        for (const s of doc.Statement) {
            for (const action of list(s.Action)) expect(action, `${file} ${s.Sid}`).not.toMatch(/^\*$|^[a-z0-9-]+:\*$/);
            for (const resource of list(s.Resource)) expect(resource === '*' || resource.startsWith('arn:aws:'), `${file} ${s.Sid}`).toBe(true);
        }
    });

    it.each(Object.values(EXEC_POLICY_FILES))('%s denies removing boundaries and editing the Spark policies', (file) => {
        const doc = readPolicy(file);
        const denies = doc.Statement.filter((s) => s.Effect === 'Deny');
        expect(denies.find((s) => list(s.Action).includes('iam:DeleteRolePermissionsBoundary'))?.Resource).toBe('*');
        const edits = denies.find((s) => list(s.Action).includes('iam:CreatePolicyVersion'))!;
        expect(list(edits.Action).sort()).toEqual(['iam:CreatePolicyVersion', 'iam:DeletePolicy', 'iam:DeletePolicyVersion', 'iam:SetDefaultPolicyVersion']);
        expect(list(edits.Resource).sort()).toEqual([ROLE_BOUNDARY_POLICY_NAME, ...Object.keys(EXEC_POLICY_FILES)]
            .map((name) => `arn:aws:iam::111122223333:policy/${name}`).sort());
    });

    it('only lets IAM roles be created or widened under Spark-* with the boundary, and passed only to Lambda', () => {
        const all = execPolicies.flatMap((d) => d.Statement).filter((s) => s.Effect === 'Allow');
        const escalating = ['iam:CreateRole', 'iam:PutRolePolicy', 'iam:AttachRolePolicy', 'iam:PutRolePermissionsBoundary', 'iam:UpdateAssumeRolePolicy'];
        for (const action of escalating) {
            const granting = all.filter((s) => list(s.Action).some((a) => iamMatch(a, action, true)));
            expect(granting, action).toHaveLength(1);
            expect(list(granting[0].Resource)).toEqual(['arn:aws:iam::111122223333:role/Spark-*']);
            expect(granting[0].Condition?.StringEquals?.['iam:PermissionsBoundary']).toBe(`arn:aws:iam::111122223333:policy/${ROLE_BOUNDARY_POLICY_NAME}`);
        }
        const passRole = all.filter((s) => list(s.Action).some((a) => iamMatch(a, 'iam:PassRole', true)));
        expect(passRole).toHaveLength(1);
        expect(passRole[0].Condition).toEqual({ StringEquals: { 'iam:PassedToService': 'lambda.amazonaws.com' } });
        // Nothing else in IAM: no users, groups, managed policies, or access keys.
        const iamActions = all.flatMap((s) => list(s.Action)).filter((a) => a.startsWith('iam:'));
        expect(iamActions.filter((a) => !/Role|OpenIDConnectProvider/.test(a))).toEqual([]);
    });

    it('the boundary grants no IAM or Organizations actions and assumes only CDK bootstrap roles', () => {
        const doc = readPolicy(BOUNDARY_FILE);
        expect(doc.Statement.every((s) => s.Effect === 'Allow')).toBe(true);
        expect(allowActions(doc).filter((a) => /^(iam|organizations|account):/.test(a))).toEqual([]);
        const assume = doc.Statement.filter((s) => list(s.Action).includes('sts:AssumeRole'));
        expect(assume.flatMap((s) => list(s.Resource))).toEqual(['arn:aws:iam::111122223333:role/cdk-hnb659fds-*']);
        expect(doc.Statement.flatMap((s) => list(s.Resource))).not.toContain('*');
    });
});
