import { CopyObjectCommand, GetBucketEncryptionCommand, GetBucketVersioningCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';

const source = process.env.BACKUP_S3_BUCKET;
const target = process.env.RESTORE_S3_BUCKET;
const prefix = process.env.RESTORE_S3_PREFIX;
if (!source || !target || !prefix) throw new Error('BACKUP_S3_BUCKET, RESTORE_S3_BUCKET, and RESTORE_S3_PREFIX are required.');
if (source === target) throw new Error('Object restore drill requires an isolated target bucket.');
if (!/(?:restore|recovery|drill|isolated)/i.test(target)) throw new Error('RESTORE_S3_BUCKET must identify an isolated restore/drill target.');

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

let token;
let restored = 0;
let restoredBytes = 0;
do {
  const page = await client.send(new ListObjectsV2Command({ Bucket: source, Prefix: prefix, ContinuationToken: token }));
  for (const object of page.Contents ?? []) {
    if (!object.Key) continue;
    const relativeKey = object.Key.slice(prefix.length).replace(/^\//, '');
    if (!relativeKey) continue;
    await client.send(new CopyObjectCommand({
      Bucket: target,
      Key: relativeKey,
      CopySource: `${encodeURIComponent(source)}/${object.Key.split('/').map(encodeURIComponent).join('/')}`,
      ServerSideEncryption: 'AES256',
      MetadataDirective: 'COPY',
    }));
    restored += 1;
    restoredBytes += object.Size ?? 0;
  }
  token = page.NextContinuationToken;
} while (token);
if (restored === 0) throw new Error('The requested backup prefix contained no objects.');
console.log(JSON.stringify({ outcome: 'success', sourcePrefix: prefix, isolatedTarget: target, restored, restoredBytes }));
