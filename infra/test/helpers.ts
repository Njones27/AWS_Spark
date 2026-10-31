// Builds the CDK app in-process for one config file, the same way app-main.ts does, with two test-only tweaks:
// the Web stack uploads test/fixtures/site (a stand-in for dist/) instead of the real build, and esbuild bundling is skipped
// (tests assert on templates; `cdk synth` in CI exercises the real bundle).

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';

import { AppContext, ProjectPrefixType } from '../lib/template/app-context';
import { createStacks, SparkStacks } from '../lib/create-stacks';
import cdkJson from '../cdk.json';

export const INFRA_DIR = path.resolve(__dirname, '..');
export const FIXTURE_DIST = path.join(__dirname, 'fixtures', 'site');

export type ConfigName = 'account-dev' | 'account-prod' | 'dev' | 'prod';
export const CONFIG_NAMES: readonly ConfigName[] = ['account-dev', 'account-prod', 'dev', 'prod'];

/** The AWS account each shipped config targets: one account for dev, one for prod. */
export const ACCOUNTS = { dev: '166147842278', prod: '027729116436' } as const;

export function configPath(name: ConfigName): string {
    return path.join(INFRA_DIR, 'config', `app-config-${name}.json`);
}

/** Copy a shipped config to a temp file with `mutate` applied, so tests never touch infra/config. */
export function writeConfigCopy(name: ConfigName, mutate: (config: any) => void): string {
    const config = JSON.parse(fs.readFileSync(configPath(name), 'utf8'));
    mutate(config);
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'spark-infra-')), `app-config-${name}.json`);
    fs.writeFileSync(file, JSON.stringify(config));
    return file;
}

export interface SynthResult {
    appContext: AppContext;
    stacks: SparkStacks;
}

export function synthConfig(configFile: string, extraContext: Record<string, unknown> = {}): SynthResult {
    const appContext = new AppContext({
        appConfigFileKey: 'APP_CONFIG',
        projectPrefixType: ProjectPrefixType.NameHyphenStage,
        contextArgs: ['Stack.Web.DistPath'],
        appProps: {
            context: {
                // The feature flags `cdk synth` would apply from cdk.json.
                ...cdkJson.context,
                APP_CONFIG: configFile,
                'Stack.Web.DistPath': FIXTURE_DIST,
                'aws:cdk:bundling-stacks': [],
                ...extraContext,
            },
        },
    });
    return { appContext, stacks: createStacks(appContext) };
}

export function templateOf(stack: cdk.Stack | undefined): Template {
    if (!stack) throw new Error('stack was not created for this config');
    return Template.fromStack(stack);
}

export function stacksOf(result: SynthResult): cdk.Stack[] {
    return result.appContext.cdkApp.node.children.filter((child): child is cdk.Stack => cdk.Stack.isStack(child));
}

export function stackIds(result: SynthResult): string[] {
    return stacksOf(result).map((stack) => stack.stackName);
}

/** The single resource of `type` in a template, or a failure listing how many there were. */
export function onlyResource(template: Template, type: string): Record<string, any> {
    const found = Object.values(template.findResources(type));
    if (found.length !== 1) throw new Error(`expected exactly one ${type}, found ${found.length}`);
    return found[0];
}
