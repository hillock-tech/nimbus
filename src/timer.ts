import {
  EventBridgeClient,
  PutRuleCommand,
  DeleteRuleCommand,
  PutTargetsCommand,
  RemoveTargetsCommand,
  DescribeRuleCommand,
  ListTargetsByRuleCommand,
} from '@aws-sdk/client-eventbridge';
import {
  LambdaClient,
  AddPermissionCommand,
  RemovePermissionCommand,
} from '@aws-sdk/client-lambda';
import { NimbusFunction } from './function';
import { TimerOptions, PolicyStatement, IResource, LambdaHandler } from './types-v2';

/**
 * Nimbus.Timer - CloudWatch Events (EventBridge) scheduled Lambda execution
 */
export class Timer implements IResource {
  private name: string;
  private region: string;
  private accountId: string;
  private schedule: string;
  private eventBridgeClient: EventBridgeClient;
  private lambdaClient: LambdaClient;
  private ruleArn?: string;
  private workerFunction?: NimbusFunction;
  private workerHandler?: LambdaHandler;
  private enabled: boolean;
  private description?: string;

  constructor(
    options: TimerOptions,
    region: string,
    accountId: string
  ) {
    this.name = options.name;
    this.region = region;
    this.accountId = accountId;
    this.schedule = options.schedule;
    this.workerHandler = options.handler;
    this.enabled = options.enabled !== false; // Default to enabled
    this.description = options.description;
    this.eventBridgeClient = new EventBridgeClient({ region });
    this.lambdaClient = new LambdaClient({ region });
  }

  /**
   * Get Timer name
   */
  getName(): string {
    return this.name;
  }

  /**
   * Set account ID (called after resolution)
   */
  setAccountId(accountId: string): void {
    this.accountId = accountId;
    // Update worker function's account ID if it exists
    if (this.workerFunction) {
      (this.workerFunction as any).accountId = accountId;
    }
  }

  /**
   * Get the rule ARN
   */
  getArn(): string {
    if (!this.ruleArn) {
      // Return expected ARN pattern
      return `arn:aws:events:${this.region}:${this.accountId}:rule/${this.name}`;
    }
    return this.ruleArn;
  }

  /**
   * Get required IAM policy statements (Timer doesn't need special permissions for Lambda)
   */
  getPolicyStatements(): PolicyStatement[] {
    return [];
  }

  /**
   * Get environment variable reference for timer name
   */
  getTimerNameRef(): { name: string; value: string } {
    return {
      name: `TIMER_${this.name.toUpperCase().replace(/-/g, '_')}_NAME`,
      value: this.name,
    };
  }

  /**
   * Get environment variable reference for timer ARN
   */
  getArnRef(): { name: string; value: string } {
    return {
      name: `TIMER_${this.name.toUpperCase().replace(/-/g, '_')}_ARN`,
      value: this.ruleArn || '',
    };
  }

  /**
   * Create worker function for the timer
   */
  createWorkerFunction(projectName: string): NimbusFunction | undefined {
    if (!this.workerHandler) {
      return undefined;
    }

    this.workerFunction = new NimbusFunction(
      {
        name: `${projectName}-timer-${this.name}`,
        handler: this.workerHandler,
        timeout: 300, // 5 minutes default for scheduled tasks
        memorySize: 256,
        description: `Timer worker for ${this.name}`,
      },
      this.region,
      this.accountId
    );

    return this.workerFunction;
  }

  /**
   * Get worker function
   */
  getWorkerFunction(): NimbusFunction | undefined {
    return this.workerFunction;
  }

  /**
   * Provision the EventBridge rule
   */
  async provision(): Promise<void> {
    // Check if rule already exists
    try {
      const describeCommand = new DescribeRuleCommand({ Name: this.name });
      const existing = await this.eventBridgeClient.send(describeCommand);
      this.ruleArn = existing.Arn;
      console.log(`    SUCCESS Using existing EventBridge rule: ${this.name}`);
    } catch (error: any) {
      if (error.name === 'ResourceNotFoundException') {
        // Create new rule
        await this.createRule();
      } else {
        throw error;
      }
    }
  }

  /**
   * Create EventBridge rule
   */
  private async createRule(): Promise<void> {
    const putRuleCommand = new PutRuleCommand({
      Name: this.name,
      Description: this.description || `Timer managed by Nimbus: ${this.name}`,
      ScheduleExpression: this.schedule,
      State: this.enabled ? 'ENABLED' : 'DISABLED',
    });

    const response = await this.eventBridgeClient.send(putRuleCommand);
    this.ruleArn = response.RuleArn;
  }

  /**
   * Create EventBridge target (Lambda function)
   */
  async createTarget(): Promise<void> {
    if (!this.workerFunction) {
      return;
    }

    const functionArn = this.workerFunction.getArn();

    // Add Lambda target to the rule
    const putTargetsCommand = new PutTargetsCommand({
      Rule: this.name,
      Targets: [
        {
          Id: '1',
          Arn: functionArn,
        },
      ],
    });

    await this.eventBridgeClient.send(putTargetsCommand);

    // Add permission for EventBridge to invoke the Lambda function
    const sourceArn = this.getArn();
    await this.addLambdaPermission(functionArn, sourceArn);

    console.log(`    SUCCESS EventBridge target created for timer: ${this.name}`);
  }

  /**
   * Add permission for EventBridge to invoke Lambda
   */
  private async addLambdaPermission(functionArn: string, sourceArn: string): Promise<void> {
    try {
      const addPermissionCommand = new AddPermissionCommand({
        FunctionName: this.workerFunction!.getName(),
        StatementId: `eventbridge-${this.name}-${Date.now()}`,
        Action: 'lambda:InvokeFunction',
        Principal: 'events.amazonaws.com',
        SourceArn: sourceArn,
      });

      await this.lambdaClient.send(addPermissionCommand);
    } catch (error: any) {
      if (error.name === 'ResourceConflictException') {
        // Permission already exists
        return;
      }
      throw error;
    }
  }

  /**
   * Validate schedule expression
   */
  static validateSchedule(schedule: string): boolean {
    // Basic validation for cron and rate expressions
    const cronPattern = /^cron\(.+\)$/;
    const ratePattern = /^rate\(.+\)$/;
    
    return cronPattern.test(schedule) || ratePattern.test(schedule);
  }

  /**
   * Destroy the EventBridge rule and targets
   */
  async destroy(): Promise<void> {
    try {
      // Remove targets first
      const listTargetsCommand = new ListTargetsByRuleCommand({ Rule: this.name });
      const targets = await this.eventBridgeClient.send(listTargetsCommand);
      
      if (targets.Targets && targets.Targets.length > 0) {
        const removeTargetsCommand = new RemoveTargetsCommand({
          Rule: this.name,
          Ids: targets.Targets.map((t: any) => t.Id!),
        });
        await this.eventBridgeClient.send(removeTargetsCommand);
      }

      // Delete the rule
      const deleteCommand = new DeleteRuleCommand({ Name: this.name });
      await this.eventBridgeClient.send(deleteCommand);
      console.log(`  SUCCESS Deleted EventBridge rule: ${this.name}`);
    } catch (error: any) {
      if (error.name === 'ResourceNotFoundException') {
        // Rule already deleted
        return;
      }
      throw error;
    }
  }
}