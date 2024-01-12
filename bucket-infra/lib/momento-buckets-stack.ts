import * as cdk from "aws-cdk-lib";
import { BlockPublicAccess, Bucket, CfnBucket } from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";
import BucketReplicationRole from "./momento-bucket-role";
import { AnyPrincipal, Effect, PolicyStatement } from "aws-cdk-lib/aws-iam";
// import * as sqs from 'aws-cdk-lib/aws-sqs';

export interface BucketRegion {
    region: string;
    arn: string;
}

export class MomentoBucketsStack extends cdk.Stack {
    private readonly _bucketArn: string;

    get bucketArn(): string {
        return this._bucketArn;
    }

    constructor(
        scope: Construct,
        id: string,
        props?: cdk.StackProps,
        bucketRegions?: BucketRegion[]
    ) {
        super(scope, id, props);

        const bucketName = `${props?.env?.region}-momento-webhook-bucket`;
        console.log(`Creating bucket ${bucketName}`);

        const bucket = new Bucket(this, "ZipBucket", {
            bucketName: bucketName,
            removalPolicy: cdk.RemovalPolicy.RETAIN,
            versioned: true,
            publicReadAccess: true,
            blockPublicAccess: new BlockPublicAccess({
                blockPublicAcls: false,
                ignorePublicAcls: false,
                blockPublicPolicy: false,
                restrictPublicBuckets: false,
            }),
        });

        bucket.addToResourcePolicy(
            new PolicyStatement({
                effect: Effect.ALLOW,
                principals: [new AnyPrincipal()],
                actions: ["s3:GetObject"],
                resources: [`${bucket.bucketArn}/*`],
            })
        );

        this._bucketArn = bucket.bucketArn;

        if (props?.env?.region === "us-west-2") {
            if (!bucketRegions) return;

            let bucketArns: string[] = [];
            for (let i = 0; i < bucketRegions.length; i++) {
                bucketArns.push(bucketRegions[i].arn);
            }

            bucketArns.push(this._bucketArn);

            const role = new BucketReplicationRole(
                this,
                "ReplicationRole",
                bucketArns!
            );

            const rules = this.replicationRules(bucketRegions!);
            const replicationConfiguration: CfnBucket.ReplicationConfigurationProperty =
                {
                    role: role.replicationRole.roleArn,
                    rules: rules,
                };

            (bucket.node.defaultChild as CfnBucket).replicationConfiguration =
                replicationConfiguration;
        }
    }

    replicationRules = (regions: BucketRegion[]): any[] => {
        console.log(regions);
        let rules: any[] = [];
        for (let i = 0; i < regions.length; i++) {
            // const bucketName = `${regions[i]}-momento-webhook-bucket`;

            rules.push({
                destination: {
                    bucket: regions[i].arn,
                },
                status: "Enabled",

                id: `replication-rule-${regions[i].region}`,

                priority: i,
                filter: {
                    prefix: "",
                },
                deleteMarkerReplication: {
                    status: "Enabled",
                },
            });
        }

        return rules;
    };
}
