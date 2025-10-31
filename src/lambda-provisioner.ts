import {
  LambdaClient,
  CreateFunctionCommand,
  GetFunctionCommand,
  UpdateFunctionCodeCommand,
  AddPermissionCommand,
  ResourceConflictException,
} from '@aws-sdk/client-lambda';
import { LambdaFunctionConfig } from './types';

/**
 * Manages Lambda function provisioning and deployment
 */
export class LambdaProvisioner {
  private lambdaClient: LambdaClient;

  constructor(region: string = 'us-east-1') {
    this.lambdaClient = new LambdaClient({ region });
  }

  /**
   * Create or update a Lambda function
   */
  async provisionFunction(config: LambdaFunctionConfig): Promise<string> {
    try {
      // Check if function exists
      const functionArn = await this.getFunctionArn(config.functionName);
      
      if (functionArn) {
        // Update existing function
        await this.updateFunctionCode(config);
        return functionArn;
      }
    } catch (error) {
      // Function doesn't exist, create it
    }

    // Create new function
    const code = typeof config.code === 'string' 
      ? { ZipFile: Buffer.from(this.createZipFromCode(config.code)) }
      : { ZipFile: config.code };

    const command = new CreateFunctionCommand({
      FunctionName: config.functionName,
      Runtime: config.runtime,
      Role: config.roleArn || await this.getOrCreateLambdaRole(),
      Handler: config.handler,
      Code: code,
      Description: config.description,
      Timeout: config.timeout || 30,
      MemorySize: config.memorySize || 128,
      Environment: config.environment ? {
        Variables: config.environment,
      } : undefined,
    });

    const response = await this.lambdaClient.send(command);
    return response.FunctionArn!;
  }

  /**
   * Get the ARN of an existing Lambda function
   */
  private async getFunctionArn(functionName: string): Promise<string | null> {
    try {
      const command = new GetFunctionCommand({ FunctionName: functionName });
      const response = await this.lambdaClient.send(command);
      return response.Configuration?.FunctionArn || null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Update Lambda function code
   */
  private async updateFunctionCode(config: LambdaFunctionConfig): Promise<void> {
    const zipFile = typeof config.code === 'string'
      ? Buffer.from(this.createZipFromCode(config.code))
      : config.code;

    const command = new UpdateFunctionCodeCommand({
      FunctionName: config.functionName,
      ZipFile: zipFile,
    });

    await this.lambdaClient.send(command);
  }

  /**
   * Grant API Gateway permission to invoke the Lambda function
   */
  async addApiGatewayPermission(
    functionName: string,
    apiId: string,
    sourceArn: string
  ): Promise<void> {
    try {
      const command = new AddPermissionCommand({
        FunctionName: functionName,
        StatementId: `apigateway-${apiId}-${Date.now()}`,
        Action: 'lambda:InvokeFunction',
        Principal: 'apigateway.amazonaws.com',
        SourceArn: sourceArn,
      });

      await this.lambdaClient.send(command);
    } catch (error) {
      if (error instanceof ResourceConflictException) {
        // Permission already exists, ignore
        console.log(`Permission already exists for ${functionName}`);
      } else {
        throw error;
      }
    }
  }

  /**
   * Create a simple ZIP file from code string (for inline code)
   * In production, you'd want to use a proper ZIP library
   */
  private createZipFromCode(code: string): string {
    // For simplicity, this is a placeholder
    // In a real implementation, use a library like 'adm-zip' or 'archiver'
    // For now, we'll assume the code is already base64-encoded ZIP data
    return code;
  }

  /**
   * Get or create a basic Lambda execution role
   * In production, you should create roles with appropriate permissions
   */
  private async getOrCreateLambdaRole(): Promise<string> {
    // This is a placeholder - you should provide a valid role ARN
    // or use IAM client to create a role with proper permissions
    throw new Error(
      'Lambda role ARN is required. Please provide roleArn in LambdaFunctionConfig ' +
      'or create a Lambda execution role with appropriate permissions.'
    );
  }
}
