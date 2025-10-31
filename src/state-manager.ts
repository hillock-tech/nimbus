import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';

export class StateManager {
  private client: S3Client;
  private bucket: string;
  private stateKey: string;
  private lockKey: string;

  constructor(bucket: string, stateKey = 'state.json', lockKey = 'state.lock', region = 'us-east-1') {
    this.client = new S3Client({ region });
    this.bucket = bucket;
    this.stateKey = stateKey;
    this.lockKey = lockKey;
  }

  async acquireLock(retryMs = 1000, maxRetries = 30): Promise<void> {
    for (let i = 0; i < maxRetries; i++) {
      try {
        await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: this.lockKey }));
        // Lock exists, wait and retry
      } catch (err: any) {
        if (err.name === 'NotFound') {
          // Lock does not exist, create it
          await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: this.lockKey, Body: 'locked' }));
          return;
        }
      }
      await new Promise(res => setTimeout(res, retryMs));
    }
    throw new Error('Could not acquire lock after max retries');
  }

  async releaseLock(): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: this.lockKey }));
  }

  async readState(): Promise<any> {
    try {
      const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: this.stateKey }));
      const stream = result.Body as any;
      const chunks: Buffer[] = [];
      for await (const chunk of stream) chunks.push(chunk);
      return JSON.parse(Buffer.concat(chunks).toString('utf-8'));
    } catch (err: any) {
      if (err.name === 'NoSuchKey' || err.name === 'NotFound') return {};
      throw err;
    }
  }

  async writeState(state: any): Promise<void> {
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: this.stateKey, Body: JSON.stringify(state) }));
  }
}
