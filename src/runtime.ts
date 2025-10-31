/**
 * Nimbus Runtime Client
 * 
 * This module provides helper functions for Lambda functions to interact
 * with AWS services at runtime. It's separate from the deployment context
 * and focuses on runtime operations.
 */

import {
  SecretsManagerClient,
  GetSecretValueCommand,
  PutSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';

import {
  SSMClient,
  GetParameterCommand,
  PutParameterCommand,
} from '@aws-sdk/client-ssm';

import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  DeleteItemCommand,
  UpdateItemCommand,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';

import {
  SQSClient,
  SendMessageCommand,
  ReceiveMessageCommand,
  DeleteMessageCommand,
} from '@aws-sdk/client-sqs';

// Global clients (reused across Lambda invocations)
let secretsClient: SecretsManagerClient;
let ssmClient: SSMClient;
let dynamoClient: DynamoDBClient;
let s3Client: S3Client;
let sqsClient: SQSClient;

// Initialize clients lazily
function getSecretsClient(): SecretsManagerClient {
  if (!secretsClient) {
    secretsClient = new SecretsManagerClient({});
  }
  return secretsClient;
}

function getSSMClient(): SSMClient {
  if (!ssmClient) {
    ssmClient = new SSMClient({});
  }
  return ssmClient;
}

function getDynamoClient(): DynamoDBClient {
  if (!dynamoClient) {
    dynamoClient = new DynamoDBClient({});
  }
  return dynamoClient;
}

function getS3Client(): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({});
  }
  return s3Client;
}

function getSQSClient(): SQSClient {
  if (!sqsClient) {
    sqsClient = new SQSClient({});
  }
  return sqsClient;
}

// Cache for runtime values (persists during Lambda execution context)
const cache = new Map<string, { value: any; expiry: number }>();

/**
 * Get cached value or fetch if expired/missing
 */
function getCached<T>(key: string, ttlMs: number = 300000): T | null { // 5 min default TTL
  const cached = cache.get(key);
  if (cached && Date.now() < cached.expiry) {
    return cached.value;
  }
  return null;
}

/**
 * Set cached value with TTL
 */
function setCached(key: string, value: any, ttlMs: number = 300000): void {
  cache.set(key, {
    value,
    expiry: Date.now() + ttlMs
  });
}

// =============================================================================
// SECRETS MANAGER HELPERS
// =============================================================================

export const secrets = {
  /**
   * Get secret value (with caching)
   */
  async get(secretName: string, options?: { cache?: boolean; ttl?: number }): Promise<any> {
    const useCache = options?.cache !== false;
    const ttl = options?.ttl || 300000; // 5 minutes default
    const cacheKey = `secret:${secretName}`;
    
    if (useCache) {
      const cached = getCached(cacheKey, ttl);
      if (cached !== null) {
        return cached;
      }
    }
    
    try {
      const command = new GetSecretValueCommand({ SecretId: secretName });
      const response = await getSecretsClient().send(command);
      
      let value;
      if (response.SecretString) {
        try {
          value = JSON.parse(response.SecretString);
        } catch {
          value = response.SecretString;
        }
      } else {
        value = null;
      }
      
      if (useCache) {
        setCached(cacheKey, value, ttl);
      }
      
      return value;
    } catch (error: any) {
      if (error.name === 'ResourceNotFoundException') {
        return null;
      }
      throw error;
    }
  },

  /**
   * Set secret value
   */
  async set(secretName: string, value: any): Promise<void> {
    const secretString = typeof value === 'string' ? value : JSON.stringify(value);
    
    const command = new PutSecretValueCommand({
      SecretId: secretName,
      SecretString: secretString,
    });
    
    await getSecretsClient().send(command);
    
    // Invalidate cache
    cache.delete(`secret:${secretName}`);
  },

  /**
   * Get secret as string
   */
  async getString(secretName: string, options?: { cache?: boolean; ttl?: number }): Promise<string | null> {
    const value = await this.get(secretName, options);
    return typeof value === 'string' ? value : (value ? JSON.stringify(value) : null);
  },

  /**
   * Get secret as JSON object
   */
  async getJson<T = any>(secretName: string, options?: { cache?: boolean; ttl?: number }): Promise<T | null> {
    const value = await this.get(secretName, options);
    return typeof value === 'object' ? value : null;
  }
};

// =============================================================================
// PARAMETER STORE HELPERS
// =============================================================================

export const parameters = {
  /**
   * Get parameter value (with caching)
   */
  async get(parameterName: string, options?: { cache?: boolean; ttl?: number; decrypt?: boolean }): Promise<string | null> {
    const useCache = options?.cache !== false;
    const ttl = options?.ttl || 300000; // 5 minutes default
    const decrypt = options?.decrypt !== false;
    const cacheKey = `param:${parameterName}`;
    
    if (useCache) {
      const cached = getCached<string>(cacheKey, ttl);
      if (cached !== null) {
        return cached;
      }
    }
    
    try {
      const command = new GetParameterCommand({
        Name: parameterName,
        WithDecryption: decrypt,
      });
      const response = await getSSMClient().send(command);
      const value = response.Parameter?.Value || null;
      
      if (useCache && value !== null) {
        setCached(cacheKey, value, ttl);
      }
      
      return value;
    } catch (error: any) {
      if (error.name === 'ParameterNotFound') {
        return null;
      }
      throw error;
    }
  },

  /**
   * Set parameter value
   */
  async set(parameterName: string, value: string, options?: { type?: 'String' | 'SecureString' | 'StringList' }): Promise<void> {
    const command = new PutParameterCommand({
      Name: parameterName,
      Value: value,
      Type: options?.type || 'String',
      Overwrite: true,
    });
    
    await getSSMClient().send(command);
    
    // Invalidate cache
    cache.delete(`param:${parameterName}`);
  },

  /**
   * Get parameter as JSON object
   */
  async getJson<T = any>(parameterName: string, options?: { cache?: boolean; ttl?: number }): Promise<T | null> {
    const value = await this.get(parameterName, options);
    if (!value) return null;
    
    try {
      return JSON.parse(value);
    } catch {
      throw new Error(`Parameter ${parameterName} does not contain valid JSON`);
    }
  },

  /**
   * Set parameter as JSON
   */
  async setJson(parameterName: string, value: any, options?: { type?: 'String' | 'SecureString' }): Promise<void> {
    await this.set(parameterName, JSON.stringify(value), options);
  }
};

// =============================================================================
// FEATURE FLAGS HELPERS
// =============================================================================

export const featureFlags = {
  /**
   * Check if a feature flag is enabled
   */
  async isEnabled(flagName: string, options?: { cache?: boolean; ttl?: number }): Promise<boolean> {
    const flags = await parameters.getJson<Record<string, boolean>>('/app/feature-flags', options);
    return flags?.[flagName] || false;
  },

  /**
   * Get all feature flags
   */
  async getAll(options?: { cache?: boolean; ttl?: number }): Promise<Record<string, boolean>> {
    const flags = await parameters.getJson<Record<string, boolean>>('/app/feature-flags', options);
    return flags || {};
  },

  /**
   * Set a feature flag
   */
  async set(flagName: string, enabled: boolean): Promise<void> {
    const currentFlags = await this.getAll({ cache: false });
    currentFlags[flagName] = enabled;
    await parameters.setJson('/app/feature-flags', currentFlags);
  },

  /**
   * Enable a feature flag
   */
  async enable(flagName: string): Promise<void> {
    await this.set(flagName, true);
  },

  /**
   * Disable a feature flag
   */
  async disable(flagName: string): Promise<void> {
    await this.set(flagName, false);
  },

  /**
   * Toggle a feature flag
   */
  async toggle(flagName: string): Promise<boolean> {
    const currentValue = await this.isEnabled(flagName, { cache: false });
    const newValue = !currentValue;
    await this.set(flagName, newValue);
    return newValue;
  }
};

// =============================================================================
// KV STORE HELPERS (DynamoDB)
// =============================================================================

export const kv = {
  /**
   * Get item from KV store
   */
  async get(tableName: string, key: Record<string, any>): Promise<Record<string, any> | null> {
    const command = new GetItemCommand({
      TableName: tableName,
      Key: marshall(key),
    });

    const response = await getDynamoClient().send(command);
    return response.Item ? unmarshall(response.Item) : null;
  },

  /**
   * Put item in KV store
   */
  async put(tableName: string, item: Record<string, any>): Promise<void> {
    const command = new PutItemCommand({
      TableName: tableName,
      Item: marshall(item),
    });

    await getDynamoClient().send(command);
  },

  /**
   * Delete item from KV store
   */
  async delete(tableName: string, key: Record<string, any>): Promise<void> {
    const command = new DeleteItemCommand({
      TableName: tableName,
      Key: marshall(key),
    });

    await getDynamoClient().send(command);
  },

  /**
   * Update item in KV store
   */
  async update(tableName: string, key: Record<string, any>, updates: Record<string, any>): Promise<void> {
    const updateExpressions: string[] = [];
    const expressionAttributeNames: Record<string, string> = {};
    const expressionAttributeValues: Record<string, any> = {};

    Object.entries(updates).forEach(([field, value], index) => {
      const nameKey = `#field${index}`;
      const valueKey = `:value${index}`;
      updateExpressions.push(`${nameKey} = ${valueKey}`);
      expressionAttributeNames[nameKey] = field;
      expressionAttributeValues[valueKey] = value;
    });

    const command = new UpdateItemCommand({
      TableName: tableName,
      Key: marshall(key),
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: marshall(expressionAttributeValues),
    });

    await getDynamoClient().send(command);
  }
};

// =============================================================================
// STORAGE HELPERS (S3)
// =============================================================================

export const storage = {
  /**
   * Get object from S3
   */
  async get(bucketName: string, key: string): Promise<string | null> {
    try {
      const command = new GetObjectCommand({
        Bucket: bucketName,
        Key: key,
      });

      const response = await getS3Client().send(command);
      return await response.Body?.transformToString() || null;
    } catch (error: any) {
      if (error.name === 'NoSuchKey') {
        return null;
      }
      throw error;
    }
  },

  /**
   * Put object to S3
   */
  async put(bucketName: string, key: string, body: string | Buffer, options?: { contentType?: string }): Promise<void> {
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: body,
      ContentType: options?.contentType,
    });

    await getS3Client().send(command);
  },

  /**
   * Delete object from S3
   */
  async delete(bucketName: string, key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: bucketName,
      Key: key,
    });

    await getS3Client().send(command);
  },

  /**
   * Get object as JSON
   */
  async getJson<T = any>(bucketName: string, key: string): Promise<T | null> {
    const content = await this.get(bucketName, key);
    if (!content) return null;
    
    try {
      return JSON.parse(content);
    } catch {
      throw new Error(`Object ${key} does not contain valid JSON`);
    }
  },

  /**
   * Put object as JSON
   */
  async putJson(bucketName: string, key: string, data: any): Promise<void> {
    await this.put(bucketName, key, JSON.stringify(data), { contentType: 'application/json' });
  }
};

// =============================================================================
// QUEUE HELPERS (SQS)
// =============================================================================

export const queue = {
  /**
   * Send message to queue
   */
  async send(queueUrl: string, message: any, options?: { delaySeconds?: number; messageGroupId?: string }): Promise<void> {
    const command = new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: typeof message === 'string' ? message : JSON.stringify(message),
      DelaySeconds: options?.delaySeconds,
      MessageGroupId: options?.messageGroupId,
    });

    await getSQSClient().send(command);
  },

  /**
   * Receive messages from queue
   */
  async receive(queueUrl: string, options?: { maxMessages?: number; waitTimeSeconds?: number }): Promise<any[]> {
    const command = new ReceiveMessageCommand({
      QueueUrl: queueUrl,
      MaxNumberOfMessages: options?.maxMessages || 1,
      WaitTimeSeconds: options?.waitTimeSeconds || 0,
    });

    const response = await getSQSClient().send(command);
    return response.Messages?.map(msg => ({
      id: msg.MessageId,
      body: msg.Body,
      receiptHandle: msg.ReceiptHandle,
      data: (() => {
        try {
          return JSON.parse(msg.Body || '{}');
        } catch {
          return msg.Body;
        }
      })()
    })) || [];
  },

  /**
   * Delete message from queue
   */
  async delete(queueUrl: string, receiptHandle: string): Promise<void> {
    const command = new DeleteMessageCommand({
      QueueUrl: queueUrl,
      ReceiptHandle: receiptHandle,
    });

    await getSQSClient().send(command);
  }
};

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Clear all cached values
 */
export function clearCache(): void {
  cache.clear();
}

/**
 * Get environment variable with optional default
 */
export function env(name: string, defaultValue?: string): string | undefined {
  return process.env[name] || defaultValue;
}

/**
 * Get required environment variable (throws if missing)
 */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Required environment variable ${name} is not set`);
  }
  return value;
}

/**
 * Parse JSON safely
 */
export function parseJson<T = any>(jsonString: string, defaultValue?: T): T {
  try {
    return JSON.parse(jsonString);
  } catch {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new Error('Invalid JSON string');
  }
}

// Default export with all helpers
export default {
  secrets,
  parameters,
  featureFlags,
  kv,
  storage,
  queue,
  clearCache,
  env,
  requireEnv,
  parseJson,
};