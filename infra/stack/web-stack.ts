// Private S3 bucket + CloudFront for the built frontend, with `/api/*` routed to the HTTP API on the same
// origin (no CORS, `connect-src 'self'`). Optional custom domain when Web.DomainName and Web.HostedZoneId are set.

import * as fs from 'fs';
import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53Targets from 'aws-cdk-lib/aws-route53-targets';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';

import { AppContext } from '../lib/template/app-context';
import { StackConfig } from '../lib/template/app-config';
import { BaseStack } from '../lib/template/stack/base/base-stack';
import { configBoolean, configString } from '../lib/config-values';

export const CONTENT_SECURITY_POLICY = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
].join('; ');

/** Hashed Vite output: safe to cache forever. */
const IMMUTABLE = 'public, max-age=31536000, immutable';
/** index.html, icons, favicon: edges keep a day (invalidated per deploy), browsers always revalidate. */
const REVALIDATE = 'public, max-age=0, s-maxage=86400, must-revalidate';

export class WebStack extends BaseStack {
    public readonly bucket: s3.Bucket;
    public readonly distribution: cloudfront.Distribution;

    constructor(appContext: AppContext, stackConfig: StackConfig) {
        super(appContext, stackConfig);

        const domainName = configString(stackConfig, 'DomainName', '');
        const hostedZoneId = configString(stackConfig, 'HostedZoneId', '');
        const cspReportOnly = configBoolean(stackConfig, 'CspReportOnly');
        // Relative paths are relative to infra/. Overridable with `-c Stack.Web.DistPath=...` (tests do).
        const distDir = path.resolve(__dirname, '..', configString(stackConfig, 'DistPath', '../dist'));
        if (!fs.existsSync(path.join(distDir, 'index.html')) || !fs.existsSync(path.join(distDir, 'assets'))) {
            throw new Error(`[web] ${distDir} has no index.html or assets/: run \`npm run build\` at the repo root first `
                + '(every cdk command synthesizes this stack, even when deploying another one)');
        }
        const isProd = this.stage === 'prod';

        // Everything in the bucket is rebuilt from git on each deploy, so dev can be torn down completely.
        this.bucket = new s3.Bucket(this, 'SiteBucket', {
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
            enforceSSL: true,
            encryption: s3.BucketEncryption.S3_MANAGED,
            versioned: false,
            removalPolicy: isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
            autoDeleteObjects: !isProd,
        });

        const securityHeaders = new cloudfront.ResponseHeadersPolicy(this, 'SecurityHeaders', {
            responseHeadersPolicyName: this.withProjectPrefix('SecurityHeaders'),
            comment: `Spark ${this.stage}: HSTS, nosniff, referrer policy, CSP${cspReportOnly ? ' (report-only)' : ''}`,
            securityHeadersBehavior: {
                strictTransportSecurity: {
                    accessControlMaxAge: cdk.Duration.days(730),
                    includeSubdomains: true,
                    override: true,
                },
                contentTypeOptions: { override: true },
                referrerPolicy: {
                    referrerPolicy: cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
                    override: true,
                },
                contentSecurityPolicy: cspReportOnly
                    ? undefined
                    : { contentSecurityPolicy: CONTENT_SECURITY_POLICY, override: true },
            },
            customHeadersBehavior: cspReportOnly
                ? {
                    customHeaders: [{
                        header: 'Content-Security-Policy-Report-Only',
                        value: CONTENT_SECURITY_POLICY,
                        override: true,
                    }],
                }
                : undefined,
        });

        // Resolved at deploy time from SSM: the Api stack's domain and the secret created by setup_initial.sh.
        const apiDomain = this.getParameter('ApiDomain');
        const originVerifySecret = this.getParameter('OriginVerifySecret');

        const customDomain = domainName.length > 0 && hostedZoneId.length > 0;
        let certificate: acm.ICertificate | undefined;
        let zone: route53.IHostedZone | undefined;
        if (customDomain) {
            if (this.region !== 'us-east-1') {
                throw new Error(`[config] CloudFront certificates must be in us-east-1; this stage is in ${this.region}`);
            }
            zone = route53.HostedZone.fromHostedZoneAttributes(this, 'HostedZone', {
                hostedZoneId,
                zoneName: domainName,
            });
            certificate = new acm.Certificate(this, 'Certificate', {
                domainName,
                validation: acm.CertificateValidation.fromDns(zone),
            });
        }

        // No errorResponses: the app uses hash routing, and custom 403/404 pages would mask API errors.
        this.distribution = new cloudfront.Distribution(this, 'Distribution', {
            comment: `Spark ${this.stage}`,
            defaultRootObject: 'index.html',
            httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
            priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
            domainNames: customDomain ? [domainName] : undefined,
            certificate,
            defaultBehavior: {
                origin: origins.S3BucketOrigin.withOriginAccessControl(this.bucket),
                viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                compress: true,
                cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
                responseHeadersPolicy: securityHeaders,
            },
            additionalBehaviors: {
                '/api/*': {
                    origin: new origins.HttpOrigin(apiDomain, {
                        protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
                        customHeaders: { 'x-origin-verify': originVerifySecret },
                    }),
                    allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
                    cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
                    // Forwards Authorization too (allowed because caching is disabled), but not Host.
                    originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
                    viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
                    compress: true,
                },
            },
        });

        if (zone) {
            const target = route53.RecordTarget.fromAlias(new route53Targets.CloudFrontTarget(this.distribution));
            new route53.ARecord(this, 'AliasA', { zone, recordName: domainName, target });
            new route53.AaaaRecord(this, 'AliasAAAA', { zone, recordName: domainName, target });
        }

        // Two passes over dist/, both prune: false so a student holding yesterday's index.html can still load
        // yesterday's chunks. Hashed assets first, then the entry files (which reference them) + invalidation.
        const deployAssets = new s3deploy.BucketDeployment(this, 'DeployAssets', {
            sources: [s3deploy.Source.asset(path.join(distDir, 'assets'))],
            destinationBucket: this.bucket,
            destinationKeyPrefix: 'assets/',
            prune: false,
            cacheControl: [s3deploy.CacheControl.fromString(IMMUTABLE)],
        });

        const deployEntry = new s3deploy.BucketDeployment(this, 'DeployEntry', {
            sources: [s3deploy.Source.asset(distDir, { exclude: ['assets', 'assets/**'] })],
            destinationBucket: this.bucket,
            prune: false,
            cacheControl: [s3deploy.CacheControl.fromString(REVALIDATE)],
            distribution: this.distribution,
            distributionPaths: ['/*'],
        });
        deployEntry.node.addDependency(deployAssets);

        this.putParameter('WebBucketName', this.bucket.bucketName);
        this.putParameter('DistributionId', this.distribution.distributionId);
        // Always the *.cloudfront.net name (it keeps working with a custom domain too): smoke tests, local proxy.
        this.putParameter('DistributionDomain', this.distribution.distributionDomainName);

        const host = customDomain ? domainName : this.distribution.distributionDomainName;
        new cdk.CfnOutput(this, 'SiteUrl', { value: `https://${host}` });
    }
}
