import {
  SQSClient,
  CreateQueueCommand,
  DeleteQueueCommand,
  GetQueueUrlCommand,
  GetQueueAttributesCommand,
  PurgeQueueCommand,
  SendMessageCommand,
} from '@aws-sdk/client-sqs';
import {
  LambdaClient,
  CreateEventSourceMappingCommand,
  ListEventSourceMappingsCommand,
  DeleteEventSourceMappingCommand,
} from '@aws-sdk/client-lambda';
import { NimbusFunction } from './function';
import { QueueOptions, PolicyStatement, IResource, LambdaHandler, DeadLetterQueueConfig } from './types-v2';

/**
 * Nimbus.Queue - SQS queue with Lambda worker
 */
export class Queue implements IResource {
  private name: string;
  private region: string;
  private accountId: string;
  private sqsClient: SQSClient;
  private lambdaClient: LambdaClient;
  private queueUrl?: string;
  private queueArn?: string;
  private workerFunction?: NimbusFunction;
  private workerHandler?: LambdaHandler;
  private batchSize: number;
  private visibilityTimeout: number;
  private eventSourceMappingId?: string;
  private deadLetterQueueConfig?: DeadLetterQueueConfig;
  private dlqUrl?: string;
  private dlqArn?: string;

  constructor(
    options: QueueOptions,
    region: string,
    accountId: string
  ) {
    this.name = options.name;
    this.region = region;
    this.accountId = accountId;
    this.batchSize = options.batchSize || 10;
    this.visibilityTimeout = options.visibilityTimeout || 30;
    this.workerHandler = options.worker;
    this.sqsClient = new SQSClient({ region });
    this.lambdaClient = new LambdaClient({ region });

    // Configure Dead Letter Queue
    if (options.deadLetterQueue) {
      if (typeof options.deadLetterQueue === 'boolean') {
        this.deadLetterQueueConfig = {
          enabled: options.deadLetterQueue,
          maxRetries: 3,
          name: `${this.name}-dlq`,
          messageRetentionPeriod: 1209600, // 14 days
        };
      } else {
        this.deadLetterQueueConfig = {
          enabled: options.deadLetterQueue.enabled ?? true,
          maxRetries: options.deadLetterQueue.maxRetries ?? 3,
          name: options.deadLetterQueue.name ?? `${this.name}-dlq`,
          messageRetentionPeriod: options.deadLetterQueue.messageRetentionPeriod ?? 1209600,
        };
      }
    }
  }

  /**
   * Get queue name
   */
  getName(): string {
    return this.name;
  }

  /**
   * Get queue ARN
   */
  getArn(): string {
    if (!this.queueArn) {
      return `arn:aws:sqs:${this.region}:${this.accountId}:${this.name}`;
    }
    return this.queueArn;
  }

  /**
   * Get queue URL
   */
  getQueueUrl(): string | undefined {
    return this.queueUrl;
  }

  /**
   * Get environment variable reference for queue URL
   */
  getQueueUrlRef(): { name: string; value: string } {
    return {
      name: `QUEUE_${this.name.toUpperCase().replace(/-/g, '_')}_URL`,
      value: this.queueUrl || '',
    };
  }

  /**
   * Get environment variable reference for queue ARN
   */
  getArnRef(): { name: string; value: string } {
    return {
      name: `QUEUE_${this.name.toUpperCase().replace(/-/g, '_')}_ARN`,
      value: this.getArn(),
    };
  }

  /**
   * Get Dead Letter Queue URL
   */
  getDlqUrl(): string | undefined {
    return this.dlqUrl;
  }

  /**
   * Get Dead Letter Queue ARN
   */
  getDlqArn(): string | undefined {
    return this.dlqArn;
  }

  /**
   * Get Dead Letter Queue configuration
   */
  getDlqConfig(): DeadLetterQueueConfig | undefined {
    return this.deadLetterQueueConfig;
  }

  /**
   * Check if Dead Letter Queue is enabled
   */
  isDlqEnabled(): boolean {
    return this.deadLetterQueueConfig?.enabled === true;
  }

  /**
   * Send a message to the queue
   */
  async send(message: any): Promise<void> {
    if (!this.queueUrl) {
      throw new Error(`Queue ${this.name} is not provisioned`);
    }

    const messageBody = typeof message === 'string' ? message : JSON.stringify(message);

    const command = new SendMessageCommand({
      QueueUrl: this.queueUrl,
      MessageBody: messageBody,
    });

    await this.sqsClient.send(command);
  }

  /**
   * Get required IAM policy statements
   */
  getPolicyStatements(): PolicyStatement[] {
    const statements: PolicyStatement[] = [
      {
        Effect: 'Allow',
        Action: [
          'sqs:SendMessage',
          'sqs:ReceiveMessage',
          'sqs:DeleteMessage',
          'sqs:GetQueueAttributes',
          'sqs:GetQueueUrl',
        ],
        Resource: this.getArn(),
      },
    ];

    // Add DLQ permissions if enabled
    if (this.isDlqEnabled() && this.dlqArn) {
      statements.push({
        Effect: 'Allow',
        Action: [
          'sqs:SendMessage',
          'sqs:ReceiveMessage',
          'sqs:DeleteMessage',
          'sqs:GetQueueAttributes',
          'sqs:GetQueueUrl',
        ],
        Resource: this.dlqArn,
      });
    }

    return statements;
  }

  /**
   * Create worker function for this queue
   */
  createWorkerFunction(projectName: string): NimbusFunction | undefined {
    if (!this.workerHandler) {
      return undefined;
    }

    this.workerFunction = new NimbusFunction(
      {
        name: `${projectName}-queue-${this.name}-worker`,
        handler: this.workerHandler,
        timeout: this.visibilityTimeout,
        memorySize: 256,
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
   * Provision the SQS queue
   */
  async provision(): Promise<void> {
    // Create Dead Letter Queue first if enabled
    if (this.isDlqEnabled()) {
      await this.provisionDeadLetterQueue();
    }

    // Check if main queue already exists
    try {
      const getUrlCommand = new GetQueueUrlCommand({
        QueueName: this.name,
      });
      const urlResponse = await this.sqsClient.send(getUrlCommand);
      this.queueUrl = urlResponse.QueueUrl;

      // Get queue ARN
      const getAttrsCommand = new GetQueueAttributesCommand({
        QueueUrl: this.queueUrl,
        AttributeNames: ['QueueArn'],
      });
      const attrsResponse = await this.sqsClient.send(getAttrsCommand);
      this.queueArn = attrsResponse.Attributes?.QueueArn;

      return;
    } catch (error: any) {
      if (error.name !== 'QueueDoesNotExist' && error.name !== 'AWS.SimpleQueueService.NonExistentQueue') {
        throw error;
      }
    }

    // Prepare queue attributes
    const attributes: Record<string, string> = {
      VisibilityTimeout: this.visibilityTimeout.toString(),
      MessageRetentionPeriod: '345600', // 4 days
    };

    // Add DLQ redrive policy if enabled
    if (this.isDlqEnabled() && this.dlqArn) {
      attributes.RedrivePolicy = JSON.stringify({
        deadLetterTargetArn: this.dlqArn,
        maxReceiveCount: this.deadLetterQueueConfig!.maxRetries,
      });
    }

    // Create the main queue
    const createCommand = new CreateQueueCommand({
      QueueName: this.name,
      Attributes: attributes,
    });

    const response = await this.sqsClient.send(createCommand);
    this.queueUrl = response.QueueUrl;

    // Get queue ARN
    const getAttrsCommand = new GetQueueAttributesCommand({
      QueueUrl: this.queueUrl,
      AttributeNames: ['QueueArn'],
    });
    const attrsResponse = await this.sqsClient.send(getAttrsCommand);
    this.queueArn = attrsResponse.Attributes?.QueueArn;

    console.log(`  Created SQS queue: ${this.name}${this.isDlqEnabled() ? ' (with DLQ)' : ''}`);
  }

  /**
   * Provision the Dead Letter Queue
   */
  private async provisionDeadLetterQueue(): Promise<void> {
    if (!this.deadLetterQueueConfig?.enabled) {
      return;
    }

    const dlqName = this.deadLetterQueueConfig.name!;

    // Check if DLQ already exists
    try {
      const getUrlCommand = new GetQueueUrlCommand({
        QueueName: dlqName,
      });
      const urlResponse = await this.sqsClient.send(getUrlCommand);
      this.dlqUrl = urlResponse.QueueUrl;

      // Get DLQ ARN
      const getAttrsCommand = new GetQueueAttributesCommand({
        QueueUrl: this.dlqUrl,
        AttributeNames: ['QueueArn'],
      });
      const attrsResponse = await this.sqsClient.send(getAttrsCommand);
      this.dlqArn = attrsResponse.Attributes?.QueueArn;

      return;
    } catch (error: any) {
      if (error.name !== 'QueueDoesNotExist' && error.name !== 'AWS.SimpleQueueService.NonExistentQueue') {
        throw error;
      }
    }

    // Create the DLQ
    const createCommand = new CreateQueueCommand({
      QueueName: dlqName,
      Attributes: {
        MessageRetentionPeriod: this.deadLetterQueueConfig.messageRetentionPeriod!.toString(),
      },
    });

    const response = await this.sqsClient.send(createCommand);
    this.dlqUrl = response.QueueUrl;

    // Get DLQ ARN
    const getAttrsCommand = new GetQueueAttributesCommand({
      QueueUrl: this.dlqUrl,
      AttributeNames: ['QueueArn'],
    });
    const attrsResponse = await this.sqsClient.send(getAttrsCommand);
    this.dlqArn = attrsResponse.Attributes?.QueueArn;

    console.log(`  Created Dead Letter Queue: ${dlqName}`);
  }

  /**
   * Create event source mapping for worker Lambda
   */
  async createEventSourceMapping(): Promise<void> {
    if (!this.workerFunction) {
      return;
    }

    const functionArn = this.workerFunction.getArn();

    // Check if mapping already exists
    const listCommand = new ListEventSourceMappingsCommand({
      FunctionName: functionArn,
      EventSourceArn: this.queueArn,
    });

    const listResponse = await this.lambdaClient.send(listCommand);
    if (listResponse.EventSourceMappings && listResponse.EventSourceMappings.length > 0) {
      this.eventSourceMappingId = listResponse.EventSourceMappings[0].UUID;
      console.log(`  INFO  Event source mapping already exists for queue ${this.name}`);
      return;
    }

    // Create event source mapping
    const createCommand = new CreateEventSourceMappingCommand({
      EventSourceArn: this.queueArn,
      FunctionName: functionArn,
      BatchSize: this.batchSize,
      Enabled: true,
    });

    const response = await this.lambdaClient.send(createCommand);
    this.eventSourceMappingId = response.UUID;
    console.log(`  Created event source mapping for queue ${this.name}`);
  }

  /**
   * Destroy the SQS queue
   */
  async destroy(): Promise<void> {
    try {
      // Delete event source mapping first
      if (this.eventSourceMappingId) {
        const deleteMapCommand = new DeleteEventSourceMappingCommand({
          UUID: this.eventSourceMappingId,
        });
        await this.lambdaClient.send(deleteMapCommand);
        console.log(`  SUCCESS Deleted event source mapping for queue: ${this.name}`);
      } else {
        // Try to find and delete any mappings
        if (this.workerFunction) {
          const listCommand = new ListEventSourceMappingsCommand({
            FunctionName: this.workerFunction.getArn(),
          });
          const listResponse = await this.lambdaClient.send(listCommand);
          
          for (const mapping of listResponse.EventSourceMappings || []) {
            if (mapping.EventSourceArn === this.queueArn) {
              const deleteMapCommand = new DeleteEventSourceMappingCommand({
                UUID: mapping.UUID,
              });
              await this.lambdaClient.send(deleteMapCommand);
              console.log(`  SUCCESS Deleted event source mapping for queue: ${this.name}`);
            }
          }
        }
      }

      // Get queue URL if we don't have it
      if (!this.queueUrl) {
        const getUrlCommand = new GetQueueUrlCommand({
          QueueName: this.name,
        });
        const urlResponse = await this.sqsClient.send(getUrlCommand);
        this.queueUrl = urlResponse.QueueUrl;
      }

      // Delete the main queue
      const deleteCommand = new DeleteQueueCommand({
        QueueUrl: this.queueUrl,
      });
      await this.sqsClient.send(deleteCommand);
      console.log(`  SUCCESS Deleted SQS queue: ${this.name}`);

      // Delete Dead Letter Queue if it exists
      if (this.isDlqEnabled()) {
        await this.destroyDeadLetterQueue();
      }
    } catch (error: any) {
      if (error.name === 'QueueDoesNotExist' || error.name === 'AWS.SimpleQueueService.NonExistentQueue') {
        // Queue already deleted
        return;
      }
      throw error;
    }
  }

  /**
   * Destroy the Dead Letter Queue
   */
  private async destroyDeadLetterQueue(): Promise<void> {
    if (!this.deadLetterQueueConfig?.enabled) {
      return;
    }

    try {
      const dlqName = this.deadLetterQueueConfig.name!;

      // Get DLQ URL if we don't have it
      if (!this.dlqUrl) {
        const getUrlCommand = new GetQueueUrlCommand({
          QueueName: dlqName,
        });
        const urlResponse = await this.sqsClient.send(getUrlCommand);
        this.dlqUrl = urlResponse.QueueUrl;
      }

      // Delete the DLQ
      const deleteCommand = new DeleteQueueCommand({
        QueueUrl: this.dlqUrl,
      });
      await this.sqsClient.send(deleteCommand);
      console.log(`  SUCCESS Deleted Dead Letter Queue: ${dlqName}`);
    } catch (error: any) {
      if (error.name === 'QueueDoesNotExist' || error.name === 'AWS.SimpleQueueService.NonExistentQueue') {
        // DLQ already deleted
        return;
      }
      console.warn(`  WARNING Failed to delete Dead Letter Queue: ${error.message}`);
    }
  }
}
