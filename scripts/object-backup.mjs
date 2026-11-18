import { CopyObjectCommand, GetBucketEncryptionCommand, GetBucketVersioningCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';

const source = process.env.ATTACHMENT_S3_BUCKET ?? process.env.S3_BUCKET;
const target = process.env.BACKUP_S3_BUCKET;
if (!source || !target) throw new Error('ATTACHMENT_S3_BUCKET/S3_BUCKET and a distinct BACKUP_S3_BUCKET are required.');
if (source === target) throw new Error('Protected-file backup bucket must be distinct from the live bucket.');
const client = new S3Client({
  region: process.env.S3_REGION ?? 'ap-southeast-1',
  endpoint: process.env.S3_ENDPOINT || undefined,
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
  ...(process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY ? {
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY },
  } : {}),
});
for (const bucket of [source, target]) {
  const [versioning, encryption] = await Promise.all([
    client.send(new GetBucketVersioningCommand({ Bucket: bucket })),
    client.send(new GetBucketEncryptionCommand({ Bucket: bucket })),
  ]);
  if (versioning.Status !== 'Enabled') throw new Error(`Bucket ${bucket} must have versioning enabled.`);
  if (!encryption.ServerSideEncryptionConfiguration?.Rules?.length) throw new Error(`Bucket ${bucket} must have default encryption.`);
}
const prefix = `snapshots/${new Date().toISOString().slice(0, 10)}/`;
let token;
let copied = 0;
do {
  const page = await client.send(new ListObjectsV2Command({ Bucket: source, ContinuationToken: token }));
  for (const object of page.Contents ?? []) {
    if (!object.Key) continue;
    await client.send(new CopyObjectCommand({
      Bucket: target,
      Key: `${prefix}${object.Key}`,
      CopySource: `${encodeURIComponent(source)}/${object.Key.split('/').map(encodeURIComponent).join('/')}`,
      ServerSideEncryption: 'AES256',
      MetadataDirective: 'COPY',
    }));
    copied += 1;
  }
  token = page.NextContinuationToken;
} while (token);
console.log(JSON.stringify({ outcome: 'success', copied, prefix }));
