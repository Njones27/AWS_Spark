// One DynamoDB table per stage (profiles, Builder Key lookups, shares). Item shapes: docs/aws/CONTRACT.md.

import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';

import { AppContext } from '../lib/template/app-context';
import { StackConfig } from '../lib/template/app-config';
import { BaseStack } from '../lib/template/stack/base/base-stack';
import { configBoolean } from '../lib/config-values';

export class DataStack extends BaseStack {
    public readonly table: dynamodb.Table;

    constructor(appContext: AppContext, stackConfig: StackConfig) {
        super(appContext, stackConfig);

        const retain = configBoolean(stackConfig, 'RetainOnDelete');

        this.table = new dynamodb.Table(this, 'Table', {
            partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
            sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            timeToLiveAttribute: 'ttl',
            pointInTimeRecoverySpecification: {
                pointInTimeRecoveryEnabled: configBoolean(stackConfig, 'PointInTimeRecovery'),
            },
            deletionProtection: retain,
            removalPolicy: retain ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
        });

        this.putParameter('TableName', this.table.tableName);
        this.putParameter('TableArn', this.table.tableArn);
    }
}
