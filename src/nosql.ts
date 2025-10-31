import {
  DynamoDBClient,
  CreateTableCommand,
  DescribeTableCommand,
  DeleteTableCommand,
  PutItemCommand,
  GetItemCommand,
  DeleteItemCommand,
  ScanCommand,
  QueryCommand,
  UpdateItemCommand,
  AttributeValue,
  UpdateContinuousBackupsCommand,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { NoSQLOptions, PolicyStatement, IResource } from './types-v2';

/**
 * Nimbus.NoSQL - NoSQL database backed by DynamoDB
 */
export class NoSQL implements IResource {
  private name: string;
  private region: string;
  private accountId: string;
  private primaryKey: string;
  private sortKey?: string;
  private readCapacity: number;
  private writeCapacity: number;
  private pointInTimeRecovery: boolean;
  private encryption: boolean;
  private backup?: {
    enabled: boolean;
    retentionDays?: number;
    schedule?: string;
  };
  private dynamoClient: DynamoDBClient;
  private arn?: string;

  constructor(
    options: NoSQLOptions,
    region: string,
    accountId: string
  ) {
    this.name = options.name;
    this.region = region;
    this.accountId = accountId;
    this.primaryKey = options.primaryKey || 'id';
    this.sortKey = options.sortKey;
    this.readCapacity = options.readCapacity || 5; // Kept for backward compatibility but not used
    this.writeCapacity = options.writeCapacity || 5; // Kept for backward compatibility but not used
    this.pointInTimeRecovery = options.pointInTimeRecovery || false;
    this.encryption = options.encryption ?? true; // Default to encrypted
    this.backup = options.backup;
    this.dynamoClient = new DynamoDBClient({ region });
  }

  /**
   * Get the table ARN
   */
  getArn(): string {
    if (!this.arn) {
      // Return expected ARN even before provisioning
      return `arn:aws:dynamodb:${this.region}:${this.accountId}:table/${this.name}`;
    }
    return this.arn;
  }

  /**
   * Get required IAM policy statements
   */
  getPolicyStatements(): PolicyStatement[] {
    const tableArn = this.getArn();
    return [
      {
        Effect: 'Allow',
        Action: [
          'dynamodb:PutItem',
          'dynamodb:GetItem',
          'dynamodb:DeleteItem',
          'dynamodb:UpdateItem',
          'dynamodb:Query',
          'dynamodb:Scan',
          'dynamodb:BatchGetItem',
          'dynamodb:BatchWriteItem',
        ],
        Resource: [tableArn, `${tableArn}/index/*`],
      },
    ];
  }

  /**
   * Provision the DynamoDB table
   */
  async provision(): Promise<void> {
    try {
      // Check if table exists
      const describeCommand = new DescribeTableCommand({ TableName: this.name });
      const existing = await this.dynamoClient.send(describeCommand);
      this.arn = existing.Table?.TableArn;
    } catch (error: any) {
      if (error.name === 'ResourceNotFoundException') {
        // Create new table
        await this.createTable();
      } else {
        throw error;
      }
    }
  }

  /**
   * Create DynamoDB table
   */
  private async createTable(): Promise<void> {
    const keySchema: any[] = [
      { AttributeName: this.primaryKey, KeyType: 'HASH' },
    ];

    const attributeDefinitions: any[] = [
      { AttributeName: this.primaryKey, AttributeType: 'S' },
    ];

    if (this.sortKey) {
      keySchema.push({ AttributeName: this.sortKey, KeyType: 'RANGE' });
      attributeDefinitions.push({ AttributeName: this.sortKey, AttributeType: 'S' });
    }

    const createCommand = new CreateTableCommand({
      TableName: this.name,
      KeySchema: keySchema,
      AttributeDefinitions: attributeDefinitions,
      BillingMode: 'PAY_PER_REQUEST', // On-demand scaling
      SSESpecification: this.encryption ? {
        Enabled: true,
        SSEType: 'KMS',
        KMSMasterKeyId: 'alias/aws/dynamodb', // Use AWS managed key
      } : undefined,

    });

    const response = await this.dynamoClient.send(createCommand);
    this.arn = response.TableDescription?.TableArn;

    // Wait for table to be active
    await this.waitForTable();

    // Configure backup if enabled
    if (this.backup?.enabled) {
      await this.configureBackup();
    }
  }

  /**
   * Configure backup policy for the table
   */
  private async configureBackup(): Promise<void> {
    if (!this.backup?.enabled) return;

    try {
      const backupCommand = new UpdateContinuousBackupsCommand({
        TableName: this.name,
        PointInTimeRecoverySpecification: {
          PointInTimeRecoveryEnabled: true,
        },
      });
      
      await this.dynamoClient.send(backupCommand);
      console.log(`  Backup enabled for table: ${this.name}`);
    } catch (error: any) {
      console.warn(`  WARNING: Failed to enable backup for ${this.name}: ${error.message}`);
    }
  }

  /**
   * Wait for table to become active
   */
  private async waitForTable(): Promise<void> {
    let attempts = 0;
    const maxAttempts = 30;

    while (attempts < maxAttempts) {
      const describeCommand = new DescribeTableCommand({ TableName: this.name });
      const response = await this.dynamoClient.send(describeCommand);

      if (response.Table?.TableStatus === 'ACTIVE') {
        return;
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
      attempts++;
    }

    throw new Error(`Table ${this.name} did not become active within timeout`);
  }

  /**
   * Put an item in the table
   */
  async put(item: Record<string, any>): Promise<void> {
    const command = new PutItemCommand({
      TableName: this.name,
      Item: marshall(item),
    });

    await this.dynamoClient.send(command);
  }

  /**
   * Get an item from the table
   */
  async get(key: Record<string, any>): Promise<Record<string, any> | null> {
    const command = new GetItemCommand({
      TableName: this.name,
      Key: marshall(key),
    });

    const response = await this.dynamoClient.send(command);
    
    if (!response.Item) {
      return null;
    }

    return unmarshall(response.Item);
  }

  /**
   * Delete an item from the table
   */
  async delete(key: Record<string, any>): Promise<void> {
    const command = new DeleteItemCommand({
      TableName: this.name,
      Key: marshall(key),
    });

    await this.dynamoClient.send(command);
  }

  /**
   * Update an item in the table
   */
  async update(
    key: Record<string, any>,
    updates: Record<string, any>
  ): Promise<void> {
    const updateExpressions: string[] = [];
    const expressionAttributeNames: Record<string, string> = {};
    const expressionAttributeValues: Record<string, AttributeValue> = {};

    Object.entries(updates).forEach(([field, value], index) => {
      const nameKey = `#field${index}`;
      const valueKey = `:value${index}`;
      updateExpressions.push(`${nameKey} = ${valueKey}`);
      expressionAttributeNames[nameKey] = field;
      expressionAttributeValues[valueKey] = marshall(value) as AttributeValue;
    });

    const command = new UpdateItemCommand({
      TableName: this.name,
      Key: marshall(key),
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
    });

    await this.dynamoClient.send(command);
  }

  /**
   * Query items from the table
   */
  async query(
    keyCondition: Record<string, any>,
    options?: { limit?: number; sortKeyCondition?: any }
  ): Promise<Record<string, any>[]> {
    const command = new QueryCommand({
      TableName: this.name,
      KeyConditionExpression: Object.keys(keyCondition)
        .map((k, i) => `#key${i} = :val${i}`)
        .join(' AND '),
      ExpressionAttributeNames: Object.keys(keyCondition).reduce(
        (acc, k, i) => ({ ...acc, [`#key${i}`]: k }),
        {}
      ),
      ExpressionAttributeValues: marshall(
        Object.values(keyCondition).reduce(
          (acc, v, i) => ({ ...acc, [`:val${i}`]: v }),
          {}
        )
      ),
      Limit: options?.limit,
    });

    const response = await this.dynamoClient.send(command);
    return (response.Items || []).map(item => unmarshall(item));
  }

  /**
   * Scan all items in the table
   */
  async scan(options?: { limit?: number }): Promise<Record<string, any>[]> {
    const command = new ScanCommand({
      TableName: this.name,
      Limit: options?.limit,
    });

    const response = await this.dynamoClient.send(command);
    return (response.Items || []).map(item => unmarshall(item));
  }

  /**
   * Get table name
   */
  getName(): string {
    return this.name;
  }

  /**
   * Get reference object for Lambda environment variables
   */
  getTableNameRef(): { name: string; value: string } {
    return {
      name: `KV_${this.name.toUpperCase().replace(/-/g, '_')}`,
      value: this.name,
    };
  }

  /**
   * Destroy the DynamoDB table
   */
  async destroy(): Promise<void> {
    try {
      const command = new DeleteTableCommand({ TableName: this.name });
      await this.dynamoClient.send(command);
      console.log(`  SUCCESS Deleted table: ${this.name}`);
    } catch (error: any) {
      if (error.name === 'ResourceNotFoundException') {
        // Table already deleted
        return;
      }
      throw error;
    }
  }
}
