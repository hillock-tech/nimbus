import {
  SSMClient,
  PutParameterCommand,
  GetParameterCommand,
  DeleteParameterCommand,
  GetParametersByPathCommand,
  ParameterType,
} from '@aws-sdk/client-ssm';
import { ParameterOptions, PolicyStatement, IResource } from './types-v2';

/**
 * Nimbus.Parameter - AWS Systems Manager Parameter Store integration
 */
export class Parameter implements IResource {
  private name: string;
  private region: string;
  private accountId: string;
  private ssmClient: SSMClient;
  private value?: string;
  private type: ParameterType;
  private description?: string;
  private keyId?: string;
  private tier?: 'Standard' | 'Advanced' | 'Intelligent-Tiering';

  constructor(
    options: ParameterOptions,
    region: string,
    accountId: string
  ) {
    this.name = options.name;
    this.region = region;
    this.accountId = accountId;
    this.value = options.value;
    this.type = options.type || ParameterType.STRING;
    this.description = options.description;
    this.keyId = options.keyId;
    this.tier = options.tier || 'Standard';
    this.ssmClient = new SSMClient({ region });
  }

  /**
   * Get parameter name
   */
  getName(): string {
    return this.name;
  }

  /**
   * Get parameter ARN
   */
  getArn(): string {
    return `arn:aws:ssm:${this.region}:${this.accountId}:parameter${this.name}`;
  }

  /**
   * Get environment variable reference for parameter name
   */
  getNameRef(): { name: string; value: string } {
    const envName = this.name
      .replace(/^\//, '') // Remove leading slash
      .replace(/\//g, '_') // Replace slashes with underscores
      .toUpperCase();
    
    return {
      name: `PARAM_${envName}`,
      value: this.name,
    };
  }

  /**
   * Get required IAM policy statements
   */
  getPolicyStatements(): PolicyStatement[] {
    const actions = ['ssm:GetParameter', 'ssm:GetParameters'];
    
    // Add decrypt permission for SecureString parameters
    if (this.type === ParameterType.SECURE_STRING) {
      actions.push('kms:Decrypt');
    }

    return [
      {
        Effect: 'Allow',
        Action: actions,
        Resource: this.getArn(),
      },
    ];
  }

  /**
   * Get policy statements for parameter management (create, update, delete)
   */
  getManagementPolicyStatements(): PolicyStatement[] {
    const actions = [
      'ssm:PutParameter',
      'ssm:GetParameter',
      'ssm:DeleteParameter',
      'ssm:GetParameters',
    ];

    // Add encrypt/decrypt permissions for SecureString parameters
    if (this.type === ParameterType.SECURE_STRING) {
      actions.push('kms:Encrypt', 'kms:Decrypt');
    }

    return [
      {
        Effect: 'Allow',
        Action: actions,
        Resource: this.getArn(),
      },
    ];
  }

  /**
   * Provision the parameter
   */
  async provision(): Promise<void> {
    // Check if parameter already exists
    try {
      const getCommand = new GetParameterCommand({
        Name: this.name,
      });
      await this.ssmClient.send(getCommand);
      console.log(`  Parameter already exists: ${this.name}`);
      return;
    } catch (error: any) {
      if (error.name !== 'ParameterNotFound') {
        throw error;
      }
    }

    // Create the parameter
    const putCommand = new PutParameterCommand({
      Name: this.name,
      Value: this.value || '',
      Type: this.type,
      Description: this.description,
      KeyId: this.keyId,
      Tier: this.tier,
    });

    await this.ssmClient.send(putCommand);
    console.log(`  Created parameter: ${this.name}`);
  }

  /**
   * Update parameter value
   */
  async updateValue(value: string): Promise<void> {
    const putCommand = new PutParameterCommand({
      Name: this.name,
      Value: value,
      Type: this.type,
      Overwrite: true,
    });

    await this.ssmClient.send(putCommand);
    console.log(`  Updated parameter: ${this.name}`);
  }

  /**
   * Get parameter value
   */
  async getValue(withDecryption: boolean = true): Promise<string | undefined> {
    try {
      const getCommand = new GetParameterCommand({
        Name: this.name,
        WithDecryption: withDecryption,
      });
      const response = await this.ssmClient.send(getCommand);
      return response.Parameter?.Value;
    } catch (error: any) {
      if (error.name === 'ParameterNotFound') {
        return undefined;
      }
      throw error;
    }
  }

  /**
   * Destroy the parameter
   */
  async destroy(): Promise<void> {
    try {
      const deleteCommand = new DeleteParameterCommand({
        Name: this.name,
      });
      await this.ssmClient.send(deleteCommand);
      console.log(`  SUCCESS Deleted parameter: ${this.name}`);
    } catch (error: any) {
      if (error.name === 'ParameterNotFound') {
        // Parameter already deleted
        return;
      }
      throw error;
    }
  }
}

/**
 * Utility class for managing parameter hierarchies
 */
export class ParameterHierarchy {
  private basePath: string;
  private region: string;
  private ssmClient: SSMClient;

  constructor(basePath: string, region: string) {
    this.basePath = basePath.endsWith('/') ? basePath : `${basePath}/`;
    this.region = region;
    this.ssmClient = new SSMClient({ region });
  }

  /**
   * Get all parameters under the base path
   */
  async getAllParameters(withDecryption: boolean = true): Promise<Record<string, string>> {
    const parameters: Record<string, string> = {};
    let nextToken: string | undefined;

    do {
      const command = new GetParametersByPathCommand({
        Path: this.basePath,
        Recursive: true,
        WithDecryption: withDecryption,
        NextToken: nextToken,
      });

      const response = await this.ssmClient.send(command);
      
      for (const param of response.Parameters || []) {
        if (param.Name && param.Value) {
          // Remove base path and convert to environment variable format
          const key = param.Name
            .replace(this.basePath, '')
            .replace(/\//g, '_')
            .toUpperCase();
          parameters[key] = param.Value;
        }
      }

      nextToken = response.NextToken;
    } while (nextToken);

    return parameters;
  }

  /**
   * Get environment variables for all parameters in hierarchy
   */
  async getEnvironmentVariables(): Promise<Record<string, string>> {
    return await this.getAllParameters(true);
  }
}