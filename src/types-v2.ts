/**
 * Core types for Nimbus serverless framework
 */

/**
 * HTTP methods supported by API Gateway
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS' | 'HEAD' | 'ANY';

/**
 * IAM policy statement
 */
export interface PolicyStatement {
  Effect: 'Allow' | 'Deny';
  Action: string | string[];
  Resource: string | string[];
}

/**
 * IAM policy document
 */
export interface PolicyDocument {
  Version: string;
  Statement: PolicyStatement[];
}

/**
 * Lambda function handler type
 */
export type LambdaHandler = (event: any, context: any) => Promise<any> | any;

/**
 * Function configuration options
 */
export interface FunctionOptions {
  /** Function name */
  name: string;
  /** Function handler code */
  handler: LambdaHandler | string;
  /** Static initialization code (runs once per Lambda container) */
  init?: (() => void) | string;
  /** Memory size in MB (128-10240) */
  memorySize?: number;
  /** Timeout in seconds (1-900) */
  timeout?: number;
  /** Environment variables */
  environment?: Record<string, string>;
  /** Description */
  description?: string;
  /** Additional IAM policy statements for this function */
  permissions?: PolicyStatement[];
  /** Enable X-Ray tracing */
  tracing?: boolean;
}

/**
 * API endpoint route configuration
 */
export interface RouteConfig {
  /** HTTP method */
  method: HttpMethod;
  /** Path pattern (e.g., '/users/{id}') */
  path: string;
  /** Handler function */
  handler: LambdaHandler | string;
  /** Enable CORS */
  cors?: boolean;
  /** Authorization type */
  authorizationType?: 'NONE' | 'AWS_IAM' | 'CUSTOM' | 'COGNITO_USER_POOLS';
  /** Authorizer ID (required when authorizationType is 'CUSTOM') */
  authorizerId?: string;
  /** Additional IAM permissions for this route's handler */
  permissions?: PolicyStatement[];
}

/**
 * API configuration options
 */
export interface APIOptions {
  /** API name */
  name: string;
  /** Description */
  description?: string;
  /** Stage name */
  stage?: string;
  /** Custom domain name (e.g., 'api.example.com') */
  customDomain?: string;
  /** Routes */
  routes?: RouteConfig[];
  /** Authorizers */
  authorizers?: AuthorizerConfig[];
  /** Enable X-Ray tracing */
  tracing?: boolean;
  /** WAF configuration */
  waf?: {
    enabled: boolean;
    rateLimiting?: {
      enabled: boolean;
      limit: number;
    };
    ipBlocking?: {
      enabled: boolean;
      blockedIPs?: string[];
      allowedIPs?: string[];
    };
    geoBlocking?: {
      enabled: boolean;
      blockedCountries?: string[];
    };
    sqlInjectionProtection?: boolean;
    xssProtection?: boolean;
  };
}

/**
 * API Gateway Authorizer configuration
 */
export interface AuthorizerConfig {
  /** Authorizer name */
  name: string;
  /** Authorizer type ('TOKEN' or 'REQUEST') */
  type: 'TOKEN' | 'REQUEST';
  /** Lambda handler function */
  handler: LambdaHandler | string;
  /** Identity source (for TOKEN type, e.g., 'method.request.header.Authorization') */
  identitySource?: string;
  /** Result TTL in seconds (0-3600) */
  authorizerResultTtlInSeconds?: number;
}

/**
 * NoSQL (DynamoDB) table configuration
 */
export interface NoSQLOptions {
  /** Table name */
  name: string;
  /** Primary key name (default: 'id') */
  primaryKey?: string;
  /** Sort key name (optional) */
  sortKey?: string;
  /** Read capacity units (default: 5) */
  readCapacity?: number;
  /** Write capacity units (default: 5) */
  writeCapacity?: number;
  /** Enable point-in-time recovery */
  pointInTimeRecovery?: boolean;
  /** Enable encryption at rest (default: true) */
  encryption?: boolean;
  /** Backup configuration */
  backup?: {
    enabled: boolean;
    retentionDays?: number;
    schedule?: string;
  };
}

// Keep KVOptions as alias for backward compatibility
export type KVOptions = NoSQLOptions;

/**
 * SQL database configuration options
 */
export interface SQLOptions {
  /** Database name */
  name: string;
  /** Schema name to create (defaults to name) */
  schema?: string;
  /** Enable deletion protection */
  deletionProtection?: boolean;
}

/**
 * S3 bucket configuration options
 */
export interface StorageOptions {
  /** Bucket name */
  name: string;
  /** Enable versioning */
  versioning?: boolean;
}

/**
 * Dead Letter Queue configuration
 */
export interface DeadLetterQueueConfig {
  /** Enable dead letter queue (default: false) */
  enabled?: boolean;
  /** Maximum number of retries before sending to DLQ (default: 3) */
  maxRetries?: number;
  /** Custom DLQ name (default: {queueName}-dlq) */
  name?: string;
  /** Message retention period in DLQ in seconds (default: 1209600 = 14 days) */
  messageRetentionPeriod?: number;
}

/**
 * SQS queue configuration options
 */
export interface QueueOptions {
  /** Queue name */
  name: string;
  /** Worker Lambda handler function */
  worker?: LambdaHandler;
  /** Batch size for Lambda processing (1-10, default: 10) */
  batchSize?: number;
  /** Visibility timeout in seconds (default: 30) */
  visibilityTimeout?: number;
  /** Dead letter queue configuration */
  deadLetterQueue?: DeadLetterQueueConfig | boolean;
}

/**
 * AWS Secrets Manager configuration options
 */
export interface SecretOptions {
  /** Secret name */
  name: string;
  /** Secret description */
  description?: string;
  /** KMS key ID for encryption (optional, uses default if not specified) */
  kmsKeyId?: string;
  /** Enable automatic rotation */
  automaticRotation?: boolean;
  /** Lambda function ARN for rotation (required if automaticRotation is true) */
  rotationLambdaArn?: string;
}

/**
 * AWS Systems Manager Parameter Store configuration options
 */
export interface ParameterOptions {
  /** Parameter name (should start with /) */
  name: string;
  /** Parameter value */
  value?: string;
  /** Parameter type */
  type?: 'String' | 'StringList' | 'SecureString';
  /** Parameter description */
  description?: string;
  /** KMS key ID for SecureString parameters */
  keyId?: string;
  /** Parameter tier */
  tier?: 'Standard' | 'Advanced' | 'Intelligent-Tiering';
}

/**
 * Timer (EventBridge) configuration options
 */
export interface TimerOptions {
  /** Timer name */
  name: string;
  /** Schedule expression (e.g., 'rate(5 minutes)' or 'cron(0 12 * * ? *)') */
  schedule: string;
  /** Handler function to execute on schedule */
  handler?: LambdaHandler;
  /** Whether the timer is enabled (default: true) */
  enabled?: boolean;
  /** Description for the timer */
  description?: string;
}

/**
 * Resource that requires IAM permissions
 */
export interface IResource {
  /** Get ARN of the resource */
  getArn(): string;
  /** Get required IAM policy statements for this resource */
  getPolicyStatements(): PolicyStatement[];
}

/**
 * Deployment result
 */
export interface DeploymentResult {
  /** Deployed APIs */
  apis: Array<{
    name: string;
    id: string;
    url: string;
    defaultUrl: string;
    customDomain?: string;
  }>;
  /** Deployed functions */
  functions: Array<{
    name: string;
    arn: string;
  }>;
  /** Deployed NoSQL stores */
  nosqlStores: Array<{
    name: string;
    arn: string;
  }>;
  /** Deployed KV stores (alias for nosqlStores) */
  kvStores?: Array<{
    name: string;
    arn: string;
  }>;
  /** Deployed SQL databases */
  sqlDatabases: Array<{
    name: string;
    arn: string;
    identifier: string;
    endpoint: string;
  }>;
  /** Deployed Storage buckets */
  storageBuckets: Array<{
    name: string;
    arn: string;
  }>;
  /** Deployed Queues */
  queues?: Array<{
    name: string;
    url: string;
    arn: string;
  }>;
  /** Deployed Timers */
  timers?: Array<{
    name: string;
    arn: string;
    schedule: string;
  }>;
  /** Deployed Secrets */
  secrets?: Array<{
    name: string;
    arn: string;
  }>;
  /** Deployed Parameters */
  parameters?: Array<{
    name: string;
    arn: string;
  }>;
  /** Created roles */
  roles: Array<{
    name: string;
    arn: string;
  }>;
}

/**
 * Nimbus configuration options
 */
export interface NimbusOptions {
  /** AWS region */
  region?: string;
  /** AWS account ID (auto-detected if not provided) */
  accountId?: string;
  /** Project name (used for resource naming) */
  projectName?: string;
  /** Deployment stage/environment (e.g., 'dev', 'staging', 'prod') */
  stage?: string;
  /** Enable X-Ray tracing for API Gateway and Lambda functions */
  tracing?: boolean;
  /** AWS credentials */
  credentials?: {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
  };
}
