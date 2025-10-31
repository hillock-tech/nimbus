import {
  S3Client,
  CreateBucketCommand,
  DeleteBucketCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
  PutBucketVersioningCommand,
} from '@aws-sdk/client-s3';
import { StorageOptions, PolicyStatement, IResource } from './types-v2';

/**
 * Nimbus.Storage - S3 bucket wrapper
 */
export class Storage implements IResource {
  private name: string;
  private baseName: string;
  private region: string;
  private accountId: string;
  private s3Client: S3Client;
  private bucketArn?: string;
  private versioning: boolean;

  constructor(
    options: StorageOptions,
    region: string,
    accountId: string
  ) {
    this.baseName = options.name;
    // Add timestamp suffix to ensure global uniqueness
    // Use compact format: YYYYMMDD-HHMMSS
    const now = new Date();
    const timestamp = now.toISOString()
      .replace(/[-:]/g, '')
      .replace('T', '-')
      .split('.')[0];
    this.name = `${options.name}-${timestamp}`;
    this.region = region;
    this.accountId = accountId;
    this.versioning = options.versioning || false;
    this.s3Client = new S3Client({ region });
  }

  /**
   * Get storage name (base name without suffix)
   */
  getName(): string {
    return this.baseName;
  }

  /**
   * Get the bucket ARN
   */
  getArn(): string {
    if (!this.bucketArn) {
      // Return expected ARN pattern
      return `arn:aws:s3:::${this.name}`;
    }
    return this.bucketArn;
  }

  /**
   * Get bucket name
   */
  getBucketName(): string {
    return this.name;
  }

  /**
   * Get environment variable reference for bucket name
   */
  getBucketNameRef(): { name: string; value: string } {
    return {
      name: `STORAGE_${this.baseName.toUpperCase().replace(/-/g, '_')}`,
      value: this.name, // Return actual bucket name with suffix
    };
  }

  /**
   * Get environment variable reference for bucket ARN
   */
  getArnRef(): { name: string; value: string } {
    return {
      name: `STORAGE_${this.baseName.toUpperCase().replace(/-/g, '_')}_ARN`,
      value: this.getArn(),
    };
  }

  /**
   * Get required IAM policy statements
   */
  getPolicyStatements(): PolicyStatement[] {
    return [
      {
        Effect: 'Allow',
        Action: [
          's3:GetObject',
          's3:PutObject',
          's3:DeleteObject',
          's3:ListBucket',
        ],
        Resource: [
          this.getArn(),
          `${this.getArn()}/*`,
        ],
      },
    ];
  }

  /**
   * Provision the S3 bucket
   */
  async provision(): Promise<void> {
    try {
      // Check if bucket exists
      const headCommand = new HeadBucketCommand({ Bucket: this.name });
      await this.s3Client.send(headCommand);
      this.bucketArn = `arn:aws:s3:::${this.name}`;
      console.log(`    INFO  Bucket ${this.name} already exists`);
    } catch (error: any) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        // Create new bucket
        await this.createBucket();
      } else {
        throw error;
      }
    }
  }

  /**
   * Create S3 bucket
   */
  private async createBucket(): Promise<void> {
    const createCommand = new CreateBucketCommand({
      Bucket: this.name,
      // LocationConstraint only needed for regions other than us-east-1
      ...(this.region !== 'us-east-1' && {
        CreateBucketConfiguration: {
          LocationConstraint: this.region as any,
        },
      }),
    });

    await this.s3Client.send(createCommand);
    this.bucketArn = `arn:aws:s3:::${this.name}`;

    // Enable versioning if requested
    if (this.versioning) {
      const versioningCommand = new PutBucketVersioningCommand({
        Bucket: this.name,
        VersioningConfiguration: {
          Status: 'Enabled',
        },
      });
      await this.s3Client.send(versioningCommand);
    }
  }

  /**
   * Destroy the S3 bucket
   */
  async destroy(): Promise<void> {
    try {
      // List and delete all objects first
      let continuationToken: string | undefined;
      
      do {
        const listCommand = new ListObjectsV2Command({
          Bucket: this.name,
          ContinuationToken: continuationToken,
        });
        
        const listResponse = await this.s3Client.send(listCommand);
        
        if (listResponse.Contents && listResponse.Contents.length > 0) {
          // Delete objects in batch
          for (const object of listResponse.Contents) {
            if (object.Key) {
              const deleteCommand = new DeleteObjectCommand({
                Bucket: this.name,
                Key: object.Key,
              });
              await this.s3Client.send(deleteCommand);
            }
          }
        }
        
        continuationToken = listResponse.NextContinuationToken;
      } while (continuationToken);

      // Delete the bucket
      const deleteCommand = new DeleteBucketCommand({ Bucket: this.name });
      await this.s3Client.send(deleteCommand);
      console.log(`  SUCCESS Deleted S3 bucket: ${this.name}`);
    } catch (error: any) {
      if (error.name === 'NoSuchBucket' || error.$metadata?.httpStatusCode === 404) {
        // Bucket already deleted
        return;
      }
      throw error;
    }
  }
}
