import { CloudFrontClient, CreateInvalidationCommand } from "@aws-sdk/client-cloudfront";

export async function invalidatePublicImage(bucket: string, path: string) {
  await new CloudFrontClient({ region: "us-east-1" }).send(new CreateInvalidationCommand({
    DistributionId: process.env.ASSET_CLOUDFRONT_DISTRIBUTION_ID,
    InvalidationBatch: { CallerReference: crypto.randomUUID(), Paths: { Quantity: 1, Items: [`/public-assets/${bucket}/${path}*`] } },
  }));
}
