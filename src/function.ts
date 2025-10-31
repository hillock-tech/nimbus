import {
  LambdaClient,
  CreateFunctionCommand,
  UpdateFunctionCodeCommand,
  UpdateFunctionConfigurationCommand,
  GetFunctionCommand,
  DeleteFunctionCommand,
  AddPermissionCommand,
  ResourceConflictException,
} from '@aws-sdk/client-lambda';
import { Role } from './role';
import { NoSQL } from './nosql';
import { SQL } from './sql';
import { Storage } from './storage';
import { Queue } from './queue';
import { Timer } from './timer';
import { FunctionOptions, LambdaHandler, IResource, PolicyStatement } from './types-v2';
import * as archiver from 'archiver';
import { Readable } from 'stream';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Nimbus.Function - Lambda function with automatic dependency management
 */
export class NimbusFunction {
  private name: string;
  private region: string;
  private accountId: string;
  private handler: LambdaHandler | string;
  private init?: (() => void) | string;
  private memorySize: number;
  private timeout: number;
  private environment: Record<string, string>;
  private description?: string;
  private lambdaClient: LambdaClient;
  private role?: Role;
  private arn?: string;
  private resources: IResource[] = [];
  private customPermissions: PolicyStatement[] = [];
  private tracing: boolean;

  constructor(
    options: FunctionOptions,
    region: string,
    accountId: string
  ) {
    this.name = options.name;
    this.region = region;
    this.accountId = accountId;
    this.handler = options.handler;
    this.init = options.init;
    this.memorySize = options.memorySize || 128;
    this.timeout = options.timeout || 30;
    this.environment = options.environment || {};
    this.description = options.description;
    this.customPermissions = options.permissions || [];
    this.tracing = options.tracing || false;
    this.lambdaClient = new LambdaClient({ region });
  }

  /**
   * Add a resource dependency (KV, SQL, or Storage)
   */
  use(resource: IResource): void {
    if (!this.resources.includes(resource)) {
      this.resources.push(resource);
      
      // Add resource-specific environment variables
      if (resource instanceof NoSQL) {
        // NoSQL store
        const tableRef = resource.getTableNameRef();
        this.environment[tableRef.name] = tableRef.value;
      } else if (resource instanceof SQL) {
        // SQL database
        const identifierRef = resource.getIdentifierRef();
        const endpointRef = resource.getEndpointRef();
        const arnRef = resource.getArnRef();
        const schemaRef = resource.getSchemaRef();
        const dbRoleRef = resource.getDbRoleRef();
        this.environment[identifierRef.name] = identifierRef.value;
        this.environment[endpointRef.name] = endpointRef.value;
        this.environment[arnRef.name] = arnRef.value;
        this.environment[schemaRef.name] = schemaRef.value;
        this.environment[dbRoleRef.name] = dbRoleRef.value;
      } else if (resource instanceof Storage) {
        // Storage bucket
        const bucketRef = resource.getBucketNameRef();
        const arnRef = resource.getArnRef();
        this.environment[bucketRef.name] = bucketRef.value;
        this.environment[arnRef.name] = arnRef.value;
      } else if (resource instanceof Queue) {
        // Queue
        const urlRef = resource.getQueueUrlRef();
        const arnRef = resource.getArnRef();
        this.environment[urlRef.name] = urlRef.value;
        this.environment[arnRef.name] = arnRef.value;
      } else if (resource instanceof Timer) {
        // Timer
        const nameRef = resource.getTimerNameRef();
        const arnRef = resource.getArnRef();
        this.environment[nameRef.name] = nameRef.value;
        this.environment[arnRef.name] = arnRef.value;
      }
    }
  }

  /**
   * Add custom IAM permissions to this function
   */
  addPermissions(permissions: PolicyStatement[]): void {
    this.customPermissions.push(...permissions);
    
    // If role is already set, add permissions to it
    if (this.role) {
      this.role.addCustomPermissions(this.customPermissions);
    }
  }

  /**
   * Add a single custom IAM permission to this function
   */
  addPermission(permission: PolicyStatement): void {
    this.addPermissions([permission]);
  }

  /**
   * Get all custom permissions for this function
   */
  getCustomPermissions(): PolicyStatement[] {
    return [...this.customPermissions];
  }

  /**
   * Set the IAM role for this function
   */
  setRole(role: Role): void {
    this.role = role;
    
    // Add all resources to the role
    for (const resource of this.resources) {
      role.addResource(resource);
    }
    
    // Add custom permissions to the role
    if (this.customPermissions.length > 0) {
      role.addCustomPermissions(this.customPermissions);
    }
  }

  /**
   * Get the function ARN
   */
  getArn(): string {
    if (!this.arn) {
      // Return expected ARN even before provisioning
      return `arn:aws:lambda:${this.region}:${this.accountId}:function:${this.name}`;
    }
    return this.arn;
  }

  /**
   * Get all resources used by this function
   */
  getResources(): IResource[] {
    return [...this.resources];
  }

  /**
   * Provision the Lambda function
   */
  async provision(roleArn: string): Promise<void> {
    const functionExists = await this.checkIfExists();

    if (functionExists) {
      await this.updateFunction();
    } else {
      await this.createFunction(roleArn);
    }
  }

  /**
   * Check if function exists
   */
  private async checkIfExists(): Promise<boolean> {
    try {
      const command = new GetFunctionCommand({ FunctionName: this.name });
      const response = await this.lambdaClient.send(command);
      this.arn = response.Configuration?.FunctionArn;
      return true;
    } catch (error: any) {
      if (error.name === 'ResourceNotFoundException') {
        return false;
      }
      throw error;
    }
  }

  /**
   * Create Lambda function
   */
  private async createFunction(roleArn: string): Promise<void> {
    const code = await this.buildCode();

    const command = new CreateFunctionCommand({
      FunctionName: this.name,
      Runtime: 'nodejs20.x',
      Role: roleArn,
      Handler: 'index.handler',
      Code: { ZipFile: code },
      Description: this.description,
      Timeout: this.timeout,
      MemorySize: this.memorySize,
      Environment: {
        Variables: this.environment,
      },
      TracingConfig: {
        Mode: this.tracing ? 'Active' : 'PassThrough',
      },
    });

    const response = await this.lambdaClient.send(command);
    this.arn = response.FunctionArn;
  }

  /**
   * Update Lambda function code
   */
  private async updateFunction(): Promise<void> {
    const code = await this.buildCode();

    // Update code
    const codeCommand = new UpdateFunctionCodeCommand({
      FunctionName: this.name,
      ZipFile: code,
    });
    await this.lambdaClient.send(codeCommand);

    // Wait for code update to complete
    await this.waitForFunctionUpdate();

    // Update configuration (environment variables and tracing)
    const configCommand = new UpdateFunctionConfigurationCommand({
      FunctionName: this.name,
      Environment: {
        Variables: this.environment,
      },
      TracingConfig: {
        Mode: this.tracing ? 'Active' : 'PassThrough',
      },
    });
    await this.lambdaClient.send(configCommand);

    // Wait for configuration update to complete
    await this.waitForFunctionUpdate();
  }

  /**
   * Wait for function to finish updating
   */
  private async waitForFunctionUpdate(): Promise<void> {
    let attempts = 0;
    const maxAttempts = 60; // 60 seconds max

    while (attempts < maxAttempts) {
      try {
        const command = new GetFunctionCommand({ FunctionName: this.name });
        const response = await this.lambdaClient.send(command);

        const state = response.Configuration?.State;
        const lastUpdateStatus = response.Configuration?.LastUpdateStatus;

        // Function is ready when State is Active and LastUpdateStatus is Successful
        if (state === 'Active' && lastUpdateStatus === 'Successful') {
          return;
        }

        // If update failed, throw error
        if (lastUpdateStatus === 'Failed') {
          throw new Error(`Function update failed: ${response.Configuration?.LastUpdateStatusReason}`);
        }

        // Otherwise, keep waiting (State might be Pending, LastUpdateStatus might be InProgress)
      } catch (error: any) {
        if (error.name !== 'ResourceNotFoundException') {
          throw error;
        }
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
      attempts++;
    }

    throw new Error(`Function ${this.name} did not complete update within timeout`);
  }

  /**
   * Build function code as ZIP
   */
  private async buildCode(): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const archive = archiver.default('zip', { zlib: { level: 9 } });

      archive.on('data', (chunk: Buffer) => chunks.push(chunk));
      archive.on('end', () => resolve(Buffer.concat(chunks)));
      archive.on('error', reject);

      // Add handler code
      const handlerCode = this.generateHandlerCode();
      archive.append(handlerCode, { name: 'index.js' });

      // Include node_modules if it exists in the project root
      const nodeModulesPath = path.join(process.cwd(), 'node_modules');
      if (fs.existsSync(nodeModulesPath)) {
        archive.directory(nodeModulesPath, 'node_modules');
      }

      archive.finalize();
    });
  }

  /**
   * Generate handler code
   */
  private generateHandlerCode(): string {
    if (typeof this.handler === 'string') {
      // If handler is a string, check if we need to add init code
      if (this.init) {
        const initCode = typeof this.init === 'string' ? this.init : this.init.toString();
        return `${initCode}\n\n${this.handler}`;
      }
      return this.handler;
    }

    // Generate init code if provided
    let initCode = '';
    if (this.init) {
      if (typeof this.init === 'string') {
        initCode = this.init;
      } else {
        // Extract the function body from the init function
        const initFunctionString = this.init.toString();
        const match = initFunctionString.match(/^(?:async\s+)?(?:function\s*)?\(\s*\)\s*(?:=>)?\s*\{([\s\S]*)\}$/);
        if (match) {
          initCode = match[1].trim();
        } else {
          // Fallback: use the entire function string
          initCode = `(${initFunctionString})();`;
        }
      }
    }

    // Serialize the handler function
    const functionString = this.handler.toString();
    
    // Wrap the handler to ensure it receives event and context parameters
    // and returns the result properly, with init code at the top
    return `
${initCode ? `// Static initialization code\n${initCode}\n` : ''}
// Handler function
const userHandler = ${functionString};
exports.handler = async (event, context) => {
  return await userHandler(event, context);
};
    `.trim();
  }

  /**
   * Add API Gateway permission
   */
  async addApiGatewayPermission(apiId: string, sourceArn: string): Promise<void> {
    try {
      const command = new AddPermissionCommand({
        FunctionName: this.name,
        StatementId: `apigateway-${apiId}-${Date.now()}`,
        Action: 'lambda:InvokeFunction',
        Principal: 'apigateway.amazonaws.com',
        SourceArn: sourceArn,
      });

      await this.lambdaClient.send(command);
    } catch (error) {
      if (error instanceof ResourceConflictException) {
        // Permission already exists
        return;
      }
      throw error;
    }
  }

  /**
   * Get function name
   */
  getName(): string {
    return this.name;
  }

  /**
   * Set account ID (called after resolution)
   */
  setAccountId(accountId: string): void {
    this.accountId = accountId;
  }

  /**
   * Destroy the Lambda function
   */
  async destroy(): Promise<void> {
    try {
      const command = new DeleteFunctionCommand({ FunctionName: this.name });
      await this.lambdaClient.send(command);
      console.log(`  SUCCESS Deleted function: ${this.name}`);
    } catch (error: any) {
      if (error.name === 'ResourceNotFoundException') {
        // Function already deleted
        return;
      }
      throw error;
    }
  }
}
