# Queue Example

This example demonstrates reliable message processing with SQS queues and dead letter queues for handling failures.

## Overview

The queue example shows:
- SQS queue with Lambda worker integration
- Dead letter queue for failed messages
- Automatic retry logic
- Message processing patterns
- Result storage in database

## Code

```typescript
import Nimbus from '@hillock-tech/nimbus-js';

const app = new Nimbus({
  projectName: 'queue-demo',
  stage: 'dev',
});

// Database to store processed results
const results = app.KV({ name: 'results' });

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

        // Save result using DynamoDB
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
          }
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
  const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');
  
  try {
    const taskData = JSON.parse(event.body || '{}');

    const task = {
      id: Date.now().toString(),
      ...taskData,
      submittedAt: new Date().toISOString(),
      status: 'queued',
    };

    // Send to queue for processing
    const sqs = new SQSClient({});
    const queueUrl = process.env.QUEUE_TASKS;

    await sqs.send(new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(task)
    }));

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
  const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
  const { DynamoDBDocumentClient, GetCommand } = require('@aws-sdk/lib-dynamodb');
  
  try {
    const id = event.pathParameters?.id;
    
    const client = new DynamoDBClient({});
    const docClient = DynamoDBDocumentClient.from(client);
    const tableName = process.env.KV_RESULTS;

    const result = await docClient.send(new GetCommand({
      TableName: tableName,
      Key: { id }
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
  const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
  const { DynamoDBDocumentClient, ScanCommand } = require('@aws-sdk/lib-dynamodb');
  
  try {
    const client = new DynamoDBClient({});
    const docClient = DynamoDBDocumentClient.from(client);
    const tableName = process.env.KV_RESULTS;

    const allResults = await docClient.send(new ScanCommand({
      TableName: tableName
    }));

    return {
      statusCode: 200,
      body: JSON.stringify({
        tasks: allResults.Items || [],
        count: allResults.Count || 0,
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
async function processTask(task) {
  // Simulate some work
  await new Promise(resolve => setTimeout(resolve, 100));
  console.log(`Processed task: ${task.name || 'Unnamed task'}`);
}

// Export for CLI deployment
export default app;
    console.log('🌐 API URL:', result.apis[0]?.url);
    console.log('📦 Queue:', result.queues?.[0]?.name);
  })
  .catch(console.error);
```

## Setup

1. **Create project directory:**
   ```bash
   mkdir queue-example
   cd queue-example
   ```

2. **Initialize project:**
   ```bash
   npm init -y
   npm install nimbus @aws-sdk/client-sqs @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb
   npm install -D @types/node tsx typescript
   ```

3. **Initialize Nimbus state:**
   ```bash
   npx nimbus init
   ```

4. **Create the application file:**
   Save the code above as `index.ts`

5. **Add package.json scripts:**
   ```json
   {
     "scripts": {
       "deploy": "npx nimbus deploy",
       "destroy": "npx nimbus destroy --project queue-demo --region us-east-1 --force"
     }
   }
   ```

## Deploy

```bash
npm run deploy
```

This will create:
1. SQS queue with dead letter queue
2. DynamoDB table for results
3. Lambda worker function
4. API Gateway for task submission
5. All necessary IAM permissions

## Test the API

### Submit a Task

```bash
curl -X POST https://YOUR_API_URL/tasks \
  -H "Content-Type: application/json" \
  -d '{"name": "Process Data", "data": "some data"}'
```

**Response:**
```json
{
  "id": "1701234567890",
  "message": "Task queued for processing"
}
```

### Submit a Failing Task (for DLQ demo)

```bash
curl -X POST https://YOUR_API_URL/tasks \
  -H "Content-Type: application/json" \
  -d '{"name": "Failing Task", "shouldFail": true}'
```

### Check Task Status

```bash
curl https://YOUR_API_URL/tasks/1701234567890
```

**Response:**
```json
{
  "id": "1701234567890",
  "name": "Process Data",
  "data": "some data",
  "status": "completed",
  "submittedAt": "2024-12-01T12:00:00.000Z",
  "completedAt": "2024-12-01T12:00:01.000Z"
}
```

### List All Tasks

```bash
curl https://YOUR_API_URL/tasks
```

**Response:**
```json
{
  "tasks": [
    {
      "id": "1701234567890",
      "name": "Process Data",
      "status": "completed",
      "completedAt": "2024-12-01T12:00:01.000Z"
    }
  ],
  "count": 1
}
```

## Key Features Demonstrated

### 1. Reliable Message Processing
- **SQS Queue**: Durable message storage
- **Dead Letter Queue**: Failed messages after 3 retries
- **Automatic Retries**: Transient failures handled automatically
- **Error Isolation**: One bad message doesn't stop others

### 2. Async Processing Flow
1. **Submit task** → API puts message in queue
2. **Worker processes** → Lambda function triggered automatically
3. **Success** → Result saved to database
4. **Failure** → Retries 3 times, then goes to DLQ

### 3. Environment Variables
- `QUEUE_TASKS` - SQS queue URL (auto-injected)
- `KV_RESULTS` - DynamoDB table name (auto-injected)

## Advanced Usage

### Batch Processing

```typescript
const batchQueue = app.Queue({
  name: 'batch-tasks',
  batchSize: 10, // Process up to 10 messages at once
  worker: async (event) => {
    const tasks = event.Records.map(record => JSON.parse(record.body));
    
    // Process all tasks in parallel
    const results = await Promise.allSettled(
      tasks.map(task => processTask(task))
    );
    
    // Log results
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        console.error(`Task ${index} failed:`, result.reason);
      } else {
        console.log(`Task ${index} completed successfully`);
      }
    });
  }
});
```

### Priority Queue Pattern

```typescript
// High priority queue
const highPriorityQueue = app.Queue({
  name: 'high-priority-tasks',
  worker: async (event) => {
    // Process high priority tasks immediately
    for (const record of event.Records) {
      const task = JSON.parse(record.body);
      await processUrgentTask(task);
    }
  }
});

// Normal priority queue
const normalPriorityQueue = app.Queue({
  name: 'normal-priority-tasks',
  worker: async (event) => {
    // Process normal priority tasks
    for (const record of event.Records) {
      const task = JSON.parse(record.body);
      await processTask(task);
    }
  }
});

// Route based on priority
api.route('POST', '/priority-tasks', async (event) => {
  const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');
  
  const task = JSON.parse(event.body || '{}');
  const queueUrl = task.priority === 'high' 
    ? process.env.QUEUE_HIGH_PRIORITY_TASKS
    : process.env.QUEUE_NORMAL_PRIORITY_TASKS;
  
  const sqs = new SQSClient({});
  
  await sqs.send(new SendMessageCommand({
    QueueUrl: queueUrl,
    MessageBody: JSON.stringify(task)
  }));
  
  return {
    statusCode: 202,
    body: JSON.stringify({ message: 'Task queued', priority: task.priority })
  };
});
```

### Message Attributes

```typescript
api.route('POST', '/tasks-with-metadata', async (event) => {
  const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');
  
  const task = JSON.parse(event.body || '{}');
  const sqs = new SQSClient({});
  
  await sqs.send(new SendMessageCommand({
    QueueUrl: process.env.QUEUE_TASKS,
    MessageBody: JSON.stringify(task),
    MessageAttributes: {
      Priority: {
        DataType: 'String',
        StringValue: task.priority || 'normal'
      },
      Source: {
        DataType: 'String',
        StringValue: 'api'
      },
      Timestamp: {
        DataType: 'Number',
        StringValue: Date.now().toString()
      }
    }
  }));
  
  return {
    statusCode: 202,
    body: JSON.stringify({ message: 'Task queued with metadata' })
  };
});
```

### Delayed Messages

```typescript
api.route('POST', '/scheduled-tasks', async (event) => {
  const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');
  
  const { task, delaySeconds } = JSON.parse(event.body || '{}');
  const sqs = new SQSClient({});
  
  await sqs.send(new SendMessageCommand({
    QueueUrl: process.env.QUEUE_TASKS,
    MessageBody: JSON.stringify(task),
    DelaySeconds: delaySeconds || 0 // Delay up to 15 minutes
  }));
  
  return {
    statusCode: 202,
    body: JSON.stringify({ 
      message: `Task scheduled for ${delaySeconds} seconds from now` 
    })
  };
});
```

## Monitoring Dead Letter Queue

Check for failed messages in AWS Console:
1. Go to SQS in AWS Console
2. Find the `dev-tasks-dlq` queue
3. Check for messages that failed processing

## Architecture

```
API Request
    ↓
SQS Queue
    ↓
Lambda Worker
    ↓
DynamoDB (Results)
    ↓
Dead Letter Queue (Failures)
```

## What You Get

- ✅ SQS queue with worker Lambda
- ✅ Dead letter queue for failed messages
- ✅ Automatic retry logic (3 attempts)
- ✅ Database for storing results
- ✅ API for submitting tasks
- ✅ CloudWatch monitoring

## Clean Up

```bash
npm run destroy
```

The `--force` flag removes all resources including data stores.

## Next Steps

- Try the [Timer example](./timer) for scheduled processing
- Explore [Authentication](./auth-api) to secure task submission
- Learn about [SQL example](./sql) for database operations

## Troubleshooting

### Common Issues

**"Queue not found"**
- Make sure deployment completed successfully
- Check that environment variable `QUEUE_TASKS` is set

**Messages not processing**
- Check CloudWatch logs for the worker Lambda function
- Verify the worker function isn't throwing unhandled errors

**Tasks stuck in queue**
- Check the visibility timeout setting
- Ensure the worker function completes within the timeout

**DLQ not receiving messages**
- Verify maxRetries is set correctly
- Check that the worker function is actually throwing errors for failed tasks