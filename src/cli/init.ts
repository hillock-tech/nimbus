import { S3Client, CreateBucketCommand, HeadBucketCommand } from '@aws-sdk/client-s3';
import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

async function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, answer => { rl.close(); resolve(answer); }));
}

export async function nimbusInit() {
  const bucket = await prompt('Enter S3 bucket name for state storage: ');
  const region = await prompt('Enter AWS region (default: us-east-1): ') || 'us-east-1';
  const client = new S3Client({ region });

  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
    console.log(`Bucket ${bucket} already exists.`);
  } catch {
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
    console.log(`Created bucket ${bucket}.`);
  }

  // Save config to home directory
  const configPath = path.resolve(os.homedir(), '.nimbusrc');
  fs.writeFileSync(configPath, JSON.stringify({ bucket, region }, null, 2));
  console.log(`State config saved to ${configPath}`);
}

if (require.main === module) {
  nimbusInit().catch(err => { console.error('Init failed:', err); process.exit(1); });
}
