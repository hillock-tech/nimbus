/**
 * Core types and interfaces for the Nimbus serverless library
 */

/**
 * HTTP methods supported by API Gateway
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS' | 'HEAD' | 'ANY';

/**
 * Lambda function runtime options
 */
export type LambdaRuntime = 
  | 'nodejs18.x'
  | 'nodejs20.x'
  | 'python3.9'
  | 'python3.10'
  | 'python3.11'
  | 'python3.12';

/**
 * Configuration for a Lambda function
 */
export interface LambdaFunctionConfig {
  /** Name of the Lambda function */
  functionName: string;
  /** Handler path (e.g., 'index.handler') */
  handler: string;
  /** Runtime environment */
  runtime: LambdaRuntime;
  /** IAM role ARN for the Lambda function */
  roleArn?: string;
  /** Function code (can be inline code or path to zip file) */
  code: string | Buffer;
  /** Memory allocation in MB (128 - 10240) */
  memorySize?: number;
  /** Timeout in seconds (1 - 900) */
  timeout?: number;
  /** Environment variables */
  environment?: Record<string, string>;
  /** Description of the function */
  description?: string;
}

/**
 * Configuration for an API Gateway endpoint
 */
export interface ApiEndpoint {
  /** HTTP path (e.g., '/users', '/products/{id}') */
  path: string;
  /** HTTP method */
  method: HttpMethod;
  /** Lambda function configuration for this endpoint */
  functionConfig: LambdaFunctionConfig;
  /** Enable CORS for this endpoint */
  cors?: boolean;
  /** Authorization type (NONE, AWS_IAM, CUSTOM, COGNITO_USER_POOLS) */
  authorizationType?: 'NONE' | 'AWS_IAM' | 'CUSTOM' | 'COGNITO_USER_POOLS';
}

/**
 * Configuration for API Gateway
 */
export interface ApiGatewayConfig {
  /** Name of the API Gateway */
  apiName: string;
  /** Description of the API */
  description?: string;
  /** API endpoints to create */
  endpoints: ApiEndpoint[];
  /** AWS region */
  region?: string;
  /** Stage name for deployment (e.g., 'dev', 'prod') */
  stageName?: string;
}

/**
 * Result of API Gateway provisioning
 */
export interface ProvisioningResult {
  /** API Gateway ID */
  apiId: string;
  /** API Gateway ARN */
  apiArn: string;
  /** Root resource ID */
  rootResourceId: string;
  /** Deployed endpoint URL */
  endpointUrl?: string;
  /** Created Lambda functions */
  lambdaFunctions: Array<{
    functionName: string;
    functionArn: string;
    path: string;
    method: HttpMethod;
  }>;
  /** Created API resources */
  resources: Array<{
    resourceId: string;
    path: string;
  }>;
}

/**
 * Options for the Nimbus client
 */
export interface NimbusOptions {
  /** AWS region (defaults to us-east-1) */
  region?: string;
  /** AWS credentials (optional, uses default credential chain if not provided) */
  credentials?: {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
  };
}
