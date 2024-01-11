import {
    Effect,
    PolicyDocument,
    PolicyStatement,
    Role,
    ServicePrincipal,
} from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";

export default class BucketReplicationRole extends Construct {
    private readonly _role: Role;

    get replicationRole(): Role {
        return this._role;
    }

    constructor(scope: Construct, id: string, arns: string[]) {
        super(scope, id);

        this._role = new Role(scope, "BucketRole", {
            roleName: "MomentoWebhookBucketReplication",
            assumedBy: new ServicePrincipal("s3.amazonaws.com"),
        });

        this._role.addToPolicy(
            new PolicyStatement({
                actions: [
                    "s3:ListBucket",
                    "s3:GetReplicationConfiguration",
                    "s3:GetObjectVersionForReplication",
                    "s3:GetObjectVersionAcl",
                    "s3:GetObjectVersionTagging",
                    "s3:GetObjectRetention",
                    "s3:GetObjectLegalHold",
                ],
                effect: Effect.ALLOW,
                resources: this.buildListResources(arns),
            })
        );
        this._role.addToPolicy(
            new PolicyStatement({
                actions: [
                    "s3:ReplicateObject",
                    "s3:ReplicateDelete",
                    "s3:ReplicateTags",
                    "s3:ObjectOwnerOverrideToBucketOwner",
                ],
                effect: Effect.ALLOW,
                resources: this.buildReplicateResources(arns),
            })
        );
    }

    buildListResources = (arns: string[]): string[] => {
        let a: string[] = [];

        for (let i = 0; i < arns.length; i++) {
            a.push(arns[i]);
            a.push(`${arns[i]}/*`);
        }

        return a;
    };

    buildReplicateResources = (arns: string[]): string[] => {
        let a: string[] = [];

        for (let i = 0; i < arns.length; i++) {
            a.push(`${arns[i]}/*`);
        }

        return a;
    };
}
