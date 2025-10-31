import Nimbus from '@hillock-tech/nimbus-js';

const app = new Nimbus({
  projectName: 'queue-demo',
  stage: 'dev',
});

// Database to store processed results
const results = app.KV({ name: 'results', primaryKey: 'id' });

// Queue with dead letter queue for reliability
const taskQueue = app.Queue({
  name: 'tasks',
  deadLetterQueue: {
    enabled: true,
    maxRetries: 3, // Try 3 times before sending to DLQ
  },
  worker: async (event) => {
    console.log('Processing', event.Records.length, 'messages');

    for (const record of event.Records) {
      try {
        const task = JSON.parse(record.body);
        console.log('Processing task:', task.id);

        // Simulate work (with occasional failure for DLQ demo)
        if (task.shouldFail) {
          throw new Error('Simulated task failure');
        }

        // Process the task
        await processTask(task);

        // Save result to DynamoDB
        const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
        const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');

        const client = new DynamoDBClient({});
        const docClient = DynamoDBDocumentClient.from(client);
        const tableName = process.env.KV_RESULTS;

        await docClient.send(new PutCommand({
          TableName: tableName,
          Item: {
            id: task.id,
            ...task,
            status: 'completed',
            completedAt: new Date().toISOString(),
          },
        }));

        console.log('Task completed:', task.id);
      } catch (error) {
        console.error('Task failed:', error);
        throw error; // Will retry up to maxRetries, then go to DLQ
      }
    }
  },
});

// API to submit tasks
const api = app.API({ name: 'queue-api' });

// Submit task to queue
api.route('POST', '/tasks', async (event) => {
  try {
    const taskData = JSON.parse(event.body || '{}');

    const task = {
      id: Date.now().toString(),
      ...taskData,
      submittedAt: new Date().toISOString(),
      status: 'queued',
    };

    // Send to queue for processing
    await taskQueue.send(task);

    return {
      statusCode: 202,
      body: JSON.stringify({
        id: task.id,
        message: 'Task queued for processing',
      }),
    };
  } catch (error) {
    console.error('Error queuing task:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to queue task' }),
    };
  }
});

// Get task result
api.route('GET', '/tasks/{id}', async (event) => {
  try {
    const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
    const { DynamoDBDocumentClient, GetCommand } = require('@aws-sdk/lib-dynamodb');

    const id = event.pathParameters?.id;
    const client = new DynamoDBClient({});
    const docClient = DynamoDBDocumentClient.from(client);
    const tableName = process.env.KV_RESULTS;

    const result = await docClient.send(new GetCommand({
      TableName: tableName,
      Key: { id },
    }));

    if (!result.Item) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Task not found' }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify(result.Item),
    };
  } catch (error) {
    console.error('Error getting task:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to get task' }),
    };
  }
});

// List all results
api.route('GET', '/tasks', async () => {
  try {
    const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
    const { DynamoDBDocumentClient, ScanCommand } = require('@aws-sdk/lib-dynamodb');

    const client = new DynamoDBClient({});
    const docClient = DynamoDBDocumentClient.from(client);
    const tableName = process.env.KV_RESULTS;

    const result = await docClient.send(new ScanCommand({
      TableName: tableName,
    }));

    return {
      statusCode: 200,
      body: JSON.stringify({
        tasks: result.Items || [],
        count: result.Count || 0,
      }),
    };
  } catch (error) {
    console.error('Error listing tasks:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to list tasks' }),
    };
  }
});

// Simulate task processing
async function processTask(task: any): Promise<void> {
  // Simulate some work
  await new Promise(resolve => setTimeout(resolve, 100));
  console.log(`Processed task: ${task.name || 'Unnamed task'}`);
}

// Export the nimbus instance for CLI to deploy
export default app;
}

export default app;