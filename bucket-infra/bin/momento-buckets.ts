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
const euEast1 = { region: "eu-west-1" };
const app = new cdk.App();

let r: BucketRegion[] = [];

const euEast1Stack = new MomentoBucketsStack(
    app,
    "MomentoWebhookEUEast1RegionBucket",
    {
        env: euEast1,
    }
);
r.push({
    region: "eu-east-1",
    arn: euEast1Stack.bucketArn,
});

const east1Stack = new MomentoBucketsStack(
    app,
    "MomentoWebhookUsEast1RegionBucket",
    {
        env: usEast1,
    }
);
r.push({
    region: "us-east-1",
    arn: east1Stack.bucketArn,
});
const east2Stack = new MomentoBucketsStack(
    app,
    "MomentoWebhookUsEast2RegionBucket",
    {
        env: usEast2,
    }
);
r.push({
    region: "us-east-2",
    arn: east2Stack.bucketArn,
});

new MomentoBucketsStack(
    app,
    "MomentoWebhookUsWest2RegionBucket",
    {
        env: usWest2,
    },
    r
);
