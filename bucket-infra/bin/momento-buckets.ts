#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import {
    BucketRegion,
    MomentoBucketsStack,
} from "../lib/momento-buckets-stack";

const usWest2 = { region: "us-west-2" };
const usEast1 = { region: "us-east-1" };
const usEast2 = { region: "us-east-2" };
const euWest1 = { region: "eu-west-1" };
const app = new cdk.App();
const euWest1Stack = new MomentoBucketsStack(
    app,
    "MomentoWebhookEUWest1RegionBucket",
    {
        env: euWest1,
    }
);

const east1Stack = new MomentoBucketsStack(
    app,
    "MomentoWebhookUsEast1RegionBucket",
    {
        env: usEast1,
    }
);

const east2Stack = new MomentoBucketsStack(
    app,
    "MomentoWebhookUsEast2RegionBucket",
    {
        env: usEast2,
    }
);

let r: BucketRegion[] = [];
r.push({ region: "eu-west-1", arn: euWest1Stack.bucketArn });
r.push({ region: "us-east-1", arn: east1Stack.bucketArn });
r.push({ region: "us-east-2", arn: east2Stack.bucketArn });

new MomentoBucketsStack(
    app,
    "MomentoWebhookUsWest2RegionBucket",
    {
        env: usWest2,
    },
    r
);
