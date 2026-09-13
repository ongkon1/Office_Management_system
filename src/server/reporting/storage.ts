import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
export interface ExportStorage {
    put(key: string, path: string, mediaType: string, sha256: string): Promise<void>;
    get(key: string): Promise<ReadableStream<Uint8Array>>;
    delete(key: string): Promise<void>;
}
/** Bucket is private; downloads are streamed through the authenticated application. */
export class S3ExportStorage implements ExportStorage {
    constructor(readonly client: S3Client, readonly bucket: string) { if (!bucket)
        throw new Error('Private export bucket is required'); }
    async put(key: string, path: string, mediaType: string, sha256: string) { await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: createReadStream(path), ContentLength: (await stat(path)).size, ContentType: mediaType, ChecksumSHA256: Buffer.from(sha256, 'hex').toString('base64'), ServerSideEncryption: 'AES256' })); }
    async get(key: string) { const response = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key })); if (!response.Body)
        throw new Error('Missing artifact'); return response.Body.transformToWebStream(); }
    async delete(key: string) { await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key })); }
}
