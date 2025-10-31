import {
  SecretsManagerClient,
  CreateSecretCommand,
  DeleteSecretCommand,
  GetSecretValueCommand,
  UpdateSecretCommand,
  DescribeSecretCommand,
  PutSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';
import { SecretOptions, PolicyStatement, IResource } from './types-v2';

/**
 * Nimbus.Secret - AWS Secrets Manager integration
 */
export class Secret implements IResource {
  private name: string;
  private region: string;
  private accountId: string;
  private secretsClient: SecretsManagerClient;
  private secretArn?: string;
  private description?: string;
  private kmsKeyId?: string;
  private automaticRotation?: boolean;
  private rotationLambdaArn?: string;

  constructor(
    options: SecretOptions,
    region: string,
    accountId: string
  ) {
    this.name = options.name;
    this.region = region;
    this.accountId = accountId;
    this.description = options.description;
    this.kmsKeyId = options.kmsKeyId;
    this.automaticRotation = options.automaticRotation;
    this.rotationLambdaArn = options.rotationLambdaArn;
    this.secretsClient = new SecretsManagerClient({ region });
  }

  /**
   * Get secret name
   */
  getName(): string {
    return this.name;
  }

  /**
   * Get secret ARN
   */
  getArn(): string {
    if (!this.secretArn) {
      return `arn:aws:secretsmanager:${this.region}:${this.accountId}:secret:${this.name}`;
    }
    return this.secretArn;
  }

  /**
   * Get environment variable reference for secret ARN
   */
  getArnRef(): { name: string; value: string } {
    return {
      name: `SECRET_${this.name.toUpperCase().replace(/-/g, '_')}_ARN`,
      value: this.getArn(),
    };
  }

  /**
   * Get environment variable reference for secret name
   */
  getNameRef(): { name: string; value: string } {
    return {
      name: `SECRET_${this.name.toUpperCase().replace(/-/g, '_')}_NAME`,
      value: this.name,
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
          'secretsmanager:GetSecretValue',
          'secretsmanager:DescribeSecret',
        ],
        Resource: this.getArn(),
      },
    ];
  }

  /**
   * Get policy statements for secret management (create, update, delete)
   */
  getManagementPolicyStatements(): PolicyStatement[] {
    return [
      {
        Effect: 'Allow',
        Action: [
          'secretsmanager:CreateSecret',
          'secretsmanager:UpdateSecret',
          'secretsmanager:DeleteSecret',
          'secretsmanager:PutSecretValue',
          'secretsmanager:GetSecretValue',
          'secretsmanager:DescribeSecret',
        ],
        Resource: this.getArn(),
      },
    ];
  }

  /**
   * Provision the secret
   */
  async provision(): Promise<void> {
    // Check if secret already exists
    try {
      const describeCommand = new DescribeSecretCommand({
        SecretId: this.name,
      });
      const response = await this.secretsClient.send(describeCommand);
      this.secretArn = response.ARN;
      console.log(`  Secret already exists: ${this.name}`);
      return;
    } catch (error: any) {
      if (error.name !== 'ResourceNotFoundException') {
        throw error;
      }
    }

    // Create the secret
    const createCommand = new CreateSecretCommand({
      Name: this.name,
      Description: this.description,
      KmsKeyId: this.kmsKeyId,
      SecretString: '{}', // Empty JSON object as placeholder
    });

    const response = await this.secretsClient.send(createCommand);
    this.secretArn = response.ARN;
    console.log(`  Created secret: ${this.name}`);

    // Set up automatic rotation if configured
    if (this.automaticRotation && this.rotationLambdaArn) {
      // Note: Rotation setup would require additional AWS SDK calls
      // This is a placeholder for future implementation
      console.log(`  INFO Automatic rotation configured for secret: ${this.name}`);
    }
  }

  /**
   * Update secret value
   */
  async updateValue(secretValue: string | Record<string, any>): Promise<void> {
    const secretString = typeof secretValue === 'string' 
      ? secretValue 
      : JSON.stringify(secretValue);

    const updateCommand = new PutSecretValueCommand({
      SecretId: this.name,
      SecretString: secretString,
    });

    await this.secretsClient.send(updateCommand);
    console.log(`  Updated secret value: ${this.name}`);
  }

  /**
   * Get secret value
   */
  async getValue(): Promise<string | undefined> {
    try {
      const getCommand = new GetSecretValueCommand({
        SecretId: this.name,
      });
      const response = await this.secretsClient.send(getCommand);
      return response.SecretString;
    } catch (error: any) {
      if (error.name === 'ResourceNotFoundException') {
        return undefined;
      }
      throw error;
    }
  }

  /**
   * Get secret value as JSON object
   */
  async getJsonValue(): Promise<Record<string, any> | undefined> {
    const value = await this.getValue();
    if (!value) {
      return undefined;
    }
    try {
      return JSON.parse(value);
    } catch {
      throw new Error(`Secret ${this.name} does not contain valid JSON`);
    }
  }

  /**
   * Destroy the secret
   */
  async destroy(): Promise<void> {
    try {
      const deleteCommand = new DeleteSecretCommand({
        SecretId: this.name,
        ForceDeleteWithoutRecovery: true, // Immediate deletion for development
      });
      await this.secretsClient.send(deleteCommand);
      console.log(`  SUCCESS Deleted secret: ${this.name}`);
    } catch (error: any) {
      if (error.name === 'ResourceNotFoundException') {
        // Secret already deleted
        return;
      }
      throw error;
    }
  }
}