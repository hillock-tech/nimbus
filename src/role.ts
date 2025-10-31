import {
  IAMClient,
  CreateRoleCommand,
  PutRolePolicyCommand,
  GetRoleCommand,
  DeleteRoleCommand,
  DeleteRolePolicyCommand,
  DetachRolePolicyCommand,
  ListAttachedRolePoliciesCommand,
  ListRolePoliciesCommand,
  AttachRolePolicyCommand,
  SimulatePrincipalPolicyCommand,
} from '@aws-sdk/client-iam';
import { PolicyDocument, PolicyStatement, IResource } from './types-v2';

/**
 * Nimbus.Role - Manages IAM roles with automatic policy generation
 */
export class Role {
  private name: string;
  private region: string;
  private accountId: string;
  private iamClient: IAMClient;
  private resources: IResource[] = [];
  private arn?: string;
  private customStatements: PolicyStatement[] = [];

  constructor(name: string, region: string, accountId: string) {
    this.name = name;
    this.region = region;
    this.accountId = accountId;
    this.iamClient = new IAMClient({ region });
  }

  /**
   * Add a resource that requires permissions
   */
  addResource(resource: IResource): void {
    if (!this.resources.includes(resource)) {
      this.resources.push(resource);
    }
  }

  /**
   * Add custom policy statement
   */
  addStatement(statement: PolicyStatement): void {
    this.customStatements.push(statement);
  }

  /**
   * Add multiple custom policy statements
   */
  addCustomPermissions(statements: PolicyStatement[]): void {
    this.customStatements.push(...statements);
  }

  /**
   * Enable X-Ray tracing permissions
   */
  enableXRayTracing(): void {
    this.addStatement({
      Effect: 'Allow',
      Action: [
        'xray:PutTraceSegments',
        'xray:PutTelemetryRecords',
      ],
      Resource: '*',
    });
  }

  /**
   * Get the role ARN
   */
  getArn(): string {
    if (!this.arn) {
      throw new Error(`Role ${this.name} has not been provisioned yet`);
    }
    return this.arn;
  }

  /**
   * Generate policy document from all resources
   */
  private generatePolicyDocument(): PolicyDocument {
    const statements: PolicyStatement[] = [
      // Basic Lambda execution permissions
      {
        Effect: 'Allow',
        Action: [
          'logs:CreateLogGroup',
          'logs:CreateLogStream',
          'logs:PutLogEvents',
        ],
        Resource: 'arn:aws:logs:*:*:*',
      },
      // Resource-specific permissions
      ...this.resources.flatMap(resource => resource.getPolicyStatements()),
      // Custom statements
      ...this.customStatements,
    ];

    return {
      Version: '2012-10-17',
      Statement: statements,
    };
  }

  /**
   * Generate assume role policy for Lambda
   */
  private getAssumeRolePolicy(): PolicyDocument {
    return {
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Action: 'sts:AssumeRole',
          Resource: JSON.stringify({
            Service: 'lambda.amazonaws.com',
          }) as any,
        },
      ],
    };
  }

  /**
   * Provision the IAM role
   */
  async provision(): Promise<string> {
    try {
      // Check if role exists
      const getCommand = new GetRoleCommand({ RoleName: this.name });
      const existing = await this.iamClient.send(getCommand);
      this.arn = existing.Role?.Arn;

      // Update policy
      await this.updatePolicy();
    } catch (error: any) {
      if (error.name === 'NoSuchEntity' || error.name === 'NoSuchEntityException') {
        // Create new role
        await this.createRole();
      } else {
        throw error;
      }
    }

    return this.arn!;
  }

  /**
   * Create a new IAM role
   */
  private async createRole(): Promise<void> {
    const assumeRolePolicy = {
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Principal: {
            Service: 'lambda.amazonaws.com',
          },
          Action: 'sts:AssumeRole',
        },
      ],
    };

    const createCommand = new CreateRoleCommand({
      RoleName: this.name,
      AssumeRolePolicyDocument: JSON.stringify(assumeRolePolicy),
      Description: `Managed by Nimbus for ${this.name}`,
    });

    const response = await this.iamClient.send(createCommand);
    this.arn = response.Role?.Arn;

    // Attach basic Lambda execution policy
    const attachCommand = new AttachRolePolicyCommand({
      RoleName: this.name,
      PolicyArn: 'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole',
    });

    await this.iamClient.send(attachCommand);

    // Add resource-specific policies
    await this.updatePolicy();

    // Wait for IAM role to propagate (eventual consistency)
    console.log(`  WAITING Waiting for IAM role to propagate...`);
    await this.waitForRolePropagation();
  }

  /**
   * Wait for IAM role to propagate with retries
   * IAM is eventually consistent - must wait for Lambda to be able to assume the role
   */
  private async waitForRolePropagation(): Promise<void> {
    const checkInterval = 3000; // Check every 3 seconds  
    const maxChecks = 20; // Up to 60 seconds (20 * 3s)
    const minChecks = 7; // Minimum 21 seconds (7 * 3s)
    
    for (let i = 0; i < maxChecks; i++) {
      await this.sleep(checkInterval);
      
      // After minimum wait, start checking
      if (i >= minChecks) {
        try {
          const getRoleCommand = new GetRoleCommand({ RoleName: this.name });
          const response = await this.iamClient.send(getRoleCommand);
          
          if (response.Role?.AssumeRolePolicyDocument) {
            const trustPolicy = JSON.parse(decodeURIComponent(response.Role.AssumeRolePolicyDocument));
            const hasLambdaPrincipal = trustPolicy.Statement?.some(
              (stmt: any) => stmt.Principal?.Service === 'lambda.amazonaws.com'
            );
            
            if (hasLambdaPrincipal) {
              const elapsed = (i + 1) * checkInterval / 1000;
              console.log(`  SUCCESS Role verified after ${elapsed}s`);
              return;
            }
          }
        } catch (error) {
          // Continue waiting on error
        }
      }
    }
    
    // Completed maximum wait
    const totalTime = maxChecks * checkInterval / 1000;
    console.log(`  SUCCESS Completed ${totalTime}s propagation wait`);
  }

  /**
   * Sleep helper for IAM propagation
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Update role policy
   */
  private async updatePolicy(): Promise<void> {
    if (this.resources.length === 0 && this.customStatements.length === 0) {
      return;
    }

    const policyDocument = this.generatePolicyDocument();

    const putPolicyCommand = new PutRolePolicyCommand({
      RoleName: this.name,
      PolicyName: `${this.name}-policy`,
      PolicyDocument: JSON.stringify(policyDocument),
    });

    await this.iamClient.send(putPolicyCommand);
  }

  /**
   * Get role name
   */
  getName(): string {
    return this.name;
  }

  /**
   * Destroy the IAM role
   */
  async destroy(): Promise<void> {
    try {
      // Detach managed policies
      const listAttachedCommand = new ListAttachedRolePoliciesCommand({
        RoleName: this.name,
      });
      const attachedPolicies = await this.iamClient.send(listAttachedCommand);

      for (const policy of attachedPolicies.AttachedPolicies || []) {
        const detachCommand = new DetachRolePolicyCommand({
          RoleName: this.name,
          PolicyArn: policy.PolicyArn,
        });
        await this.iamClient.send(detachCommand);
      }

      // Delete inline policies
      const listInlineCommand = new ListRolePoliciesCommand({
        RoleName: this.name,
      });
      const inlinePolicies = await this.iamClient.send(listInlineCommand);

      for (const policyName of inlinePolicies.PolicyNames || []) {
        const deleteCommand = new DeleteRolePolicyCommand({
          RoleName: this.name,
          PolicyName: policyName,
        });
        await this.iamClient.send(deleteCommand);
      }

      // Delete the role
      const deleteRoleCommand = new DeleteRoleCommand({
        RoleName: this.name,
      });
      await this.iamClient.send(deleteRoleCommand);

      console.log(`  SUCCESS Deleted role: ${this.name}`);
    } catch (error: any) {
      if (error.name === 'NoSuchEntity' || error.name === 'NoSuchEntityException') {
        // Role already deleted
        return;
      }
      throw error;
    }
  }
}
