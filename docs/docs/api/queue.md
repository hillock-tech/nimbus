# Queue

The Queue class represents an SQS queue with automatic Lambda worker integration for reliable message processing.

## Creation

```typescript
const queue = app.Queue(config: QueueConfig)
```

### QueueConfig

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `name` | `string` | ✅ | Queue name |
| `worker` | `function` | ✅ | Message processing function |
| `visibilityTimeout` | `number` | ❌ | Message visibility timeout in seconds (default: 30) |
| `messageRetention` | `number` | ❌ | Message retention period in seconds (default: 1209600 - 14 days) |
| `deadLetterQueue` | `object` | ❌ | Dead letter queue configuration |
| `batchSize` | `number` | ❌ | Messages per batch (default: 10) |

### Example

```typescript
const taskQueue = app.Queue({
  name: 'tasks',
  worker: async (event) => {
    // Process messages
    for (const record of event.Records) {
      const message = JSON.parse(record.body);
      console.log('Processing:', message);
      
      // Your processing logic here
      await processTask(message);
    }
  },
  visibilityTimeout: 300,
  deadLetterQueue: {
    enabled: true,
    maxRetries: 3
  }
});
```

## Environment Variables

Queues automatically inject environment variables:

- `QUEUE_{NAME}` - Queue URL (e.g., `QUEUE_TASKS`)
- `QUEUE_{NAME}_ARN` - Queue ARN

## Worker Function

The worker function is automatically triggered when messages arrive in the queue. It receives an SQS event with one or more messages.

### Event Structure

```typescript
interface SQSEvent {
  Records: Array<{
    messageId: string;
    receiptHandle: string;
    body: string;
    attributes: Record<string, string>;
    messageAttributes: Record<string, any>;
    md5OfBody: string;
    eventSource: string;
    eventSourceARN: string;
    awsRegion: string;
  }>;
}
```

### Processing Messages

```typescript
const emailQueue = app.Queue({
  name: 'emails',
  worker: async (event) => {
    console.log(`Processing ${event.Records.length} messages`);
    
    for (const record of event.Records) {
      try {
        const emailData = JSON.parse(record.body);
        
        // Send email
        await sendEmail(emailData.to, emailData.subject, emailData.body);
        
        console.log(`Email sent to ${emailData.to}`);
      } catch (error) {
        console.error('Failed to process message:', error);
        throw error; // Will retry or send to DLQ
      }
    }
  }
});
```

## Sending Messages

Send messages to the queue from API routes or other functions:

```typescript
api.route('POST', '/tasks', async (event) => {
  const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');
  
  const task = JSON.parse(event.body || '{}');
  const queueUrl = process.env.QUEUE_TASKS; // Auto-injected
  
  const sqs = new SQSClient({});
  
  try {
    await sqs.send(new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify({
        id: Date.now().toString(),
        ...task,
        submittedAt: new Date().toISOString()
      })
    }));
    
    return {
      statusCode: 202,
      body: JSON.stringify({ message: 'Task queued for processing' })
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to queue task' })
    };
  }
});
```

## Dead Letter Queue

Configure automatic handling of failed messages:

```typescript
const reliableQueue = app.Queue({
  name: 'reliable-tasks',
  worker: async (event) => {
    for (const record of event.Records) {
      const task = JSON.parse(record.body);
      
      // Simulate occasional failure
      if (Math.random() < 0.1) {
        throw new Error('Random failure for DLQ demo');
      }
      
      await processTask(task);
    }
  },
  deadLetterQueue: {
    enabled: true,
    maxRetries: 3 // Retry 3 times before sending to DLQ
  }
});
```

## Batch Processing

Process multiple messages efficiently:

```typescript
const batchQueue = app.Queue({
  name: 'batch-processor',
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

## Error Handling

```typescript
const robustQueue = app.Queue({
  name: 'robust-processor',
  worker: async (event) => {
    for (const record of event.Records) {
      try {
        const message = JSON.parse(record.body);
        
        // Validate message
        if (!message.id || !message.type) {
          throw new Error('Invalid message format');
        }
        
        // Process based on type
        switch (message.type) {
          case 'email':
            await processEmail(message);
            break;
          case 'notification':
            await processNotification(message);
            break;
          default:
            throw new Error(`Unknown message type: ${message.type}`);
        }
        
        console.log(`Processed message ${message.id}`);
      } catch (error) {
        console.error('Message processing failed:', error);
        console.error('Message:', record.body);
        
        // Re-throw to trigger retry/DLQ behavior
        throw error;
      }
    }
  },
  deadLetterQueue: {
    enabled: true,
    maxRetries: 3
  }
});
```

## Message Attributes

Send messages with additional metadata:

```typescript
api.route('POST', '/priority-tasks', async (event) => {
  const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');
  
  const task = JSON.parse(event.body || '{}');
  const queueUrl = process.env.QUEUE_TASKS;
  
  const sqs = new SQSClient({});
  
  await sqs.send(new SendMessageCommand({
    QueueUrl: queueUrl,
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
    body: JSON.stringify({ message: 'Priority task queued' })
  };
});
```

## Delayed Messages

Send messages with a delay:

```typescript
api.route('POST', '/scheduled-tasks', async (event) => {
  const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');
  
  const { task, delaySeconds } = JSON.parse(event.body || '{}');
  const queueUrl = process.env.QUEUE_TASKS;
  
  const sqs = new SQSClient({});
  
  await sqs.send(new SendMessageCommand({
    QueueUrl: queueUrl,
    MessageBody: JSON.stringify(task),
    DelaySeconds: delaySeconds || 0 // Delay up to 15 minutes (900 seconds)
  }));
  
  return {
    statusCode: 202,
    body: JSON.stringify({ 
      message: `Task scheduled for ${delaySeconds} seconds from now` 
    })
  };
});
```

## Best Practices

1. **Idempotency**: Make message processing idempotent to handle duplicates
2. **Error Handling**: Always handle errors gracefully and log details
3. **Batch Size**: Adjust batch size based on processing time and memory usage
4. **Dead Letter Queue**: Always configure DLQ for production workloads
5. **Monitoring**: Log processing metrics and errors for observability
6. **Message Size**: Keep messages under 256KB (SQS limit)
7. **Visibility Timeout**: Set appropriate timeout based on processing time
8. **Retry Logic**: Use exponential backoff for external service calls

## Common Patterns

### Task Processing Pipeline

```typescript
const taskQueue = app.Queue({
  name: 'task-pipeline',
  worker: async (event) => {
    for (const record of event.Records) {
      const task = JSON.parse(record.body);
      
      // Step 1: Validate
      if (!isValidTask(task)) {
        throw new Error('Invalid task format');
      }
      
      // Step 2: Process
      const result = await processTask(task);
      
      // Step 3: Store result
      await storeResult(task.id, result);
      
      // Step 4: Notify completion
      await notifyCompletion(task.userId, task.id);
    }
  },
  deadLetterQueue: { enabled: true, maxRetries: 3 }
});
```

### Fan-out Pattern

```typescript
// Main queue receives tasks and fans out to specialized queues
const mainQueue = app.Queue({
  name: 'main-tasks',
  worker: async (event) => {
    const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');
    const sqs = new SQSClient({});
    
    for (const record of event.Records) {
      const task = JSON.parse(record.body);
      
      // Route to appropriate specialized queue
      let targetQueue;
      switch (task.type) {
        case 'email':
          targetQueue = process.env.QUEUE_EMAIL_TASKS;
          break;
        case 'image':
          targetQueue = process.env.QUEUE_IMAGE_TASKS;
          break;
        default:
          targetQueue = process.env.QUEUE_DEFAULT_TASKS;
      }
      
      await sqs.send(new SendMessageCommand({
        QueueUrl: targetQueue,
        MessageBody: JSON.stringify(task)
      }));
    }
  }
});

// Specialized queues
const emailQueue = app.Queue({
  name: 'email-tasks',
  worker: async (event) => {
    // Handle email tasks
  }
});

const imageQueue = app.Queue({
  name: 'image-tasks',
  worker: async (event) => {
    // Handle image processing tasks
  }
});
```The Queue cl
ass represents an SQS queue with automatic Lambda worker integration for reliable message processing.

## Creation

```typescript
const queue = app.Queue(config: QueueConfig)
```

### QueueConfig

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `name` | `string` | ✅ | Queue name |
| `worker` | `function` | ✅ | Message processing function |
| `visibilityTimeout` | `number` | ❌ | Message visibility timeout in seconds (default: 30) |
| `messageRetention` | `number` | ❌ | Message retention period in seconds (default: 1209600 - 14 days) |
| `deadLetterQueue` | `object` | ❌ | Dead letter queue configuration |
| `batchSize` | `number` | ❌ | Messages per batch (default: 10) |

### Example

```typescript
const taskQueue = app.Queue({
  name: 'tasks',
  worker: async (event) => {
    // Process messages
    for (const record of event.Records) {
      const message = JSON.parse(record.body);
      console.log('Processing:', message);
      
      // Your processing logic here
      await processTask(message);
    }
  },
  visibilityTimeout: 300,
  deadLetterQueue: {
    enabled: true,
    maxRetries: 3
  }
});
```

## Environment Variables

Queues automatically inject environment variables:

- `QUEUE_{NAME}` - Queue URL (e.g., `QUEUE_TASKS`)
- `QUEUE_{NAME}_ARN` - Queue ARN

## Worker Function

The worker function is automatically triggered when messages arrive in the queue. It receives an SQS event with one or more messages.

### Event Structure

```typescript
interface SQSEvent {
  Records: Array<{
    messageId: string;
    receiptHandle: string;
    body: string;
    attributes: Record<string, string>;
    messageAttributes: Record<string, any>;
    md5OfBody: string;
    eventSource: string;
    eventSourceARN: string;
    awsRegion: string;
  }>;
}
```

### Processing Messages

```typescript
const emailQueue = app.Queue({
  name: 'emails',
  worker: async (event) => {
    console.log(`Processing ${event.Records.length} messages`);
    
    for (const record of event.Records) {
      try {
        const emailData = JSON.parse(record.body);
        
        // Send email
        await sendEmail(emailData.to, emailData.subject, emailData.body);
        
        console.log(`Email sent to ${emailData.to}`);
      } catch (error) {
        console.error('Failed to process message:', error);
        throw error; // Will retry or send to DLQ
      }
    }
  }
});
```

## Sending Messages

Send messages to the queue from API routes or other functions:

```typescript
api.route('POST', '/tasks', async (event) => {
  const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');
  
  const task = JSON.parse(event.body || '{}');
  const queueUrl = process.env.QUEUE_TASKS; // Auto-injected
  
  const sqs = new SQSClient({});
  
  try {
    await sqs.send(new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify({
        id: Date.now().toString(),
        ...task,
        submittedAt: new Date().toISOString()
      })
    }));
    
    return {
      statusCode: 202,
      body: JSON.stringify({ message: 'Task queued for processing' })
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to queue task' })
    };
  }
});
```

## Dead Letter Queue

Configure automatic handling of failed messages:

```typescript
const reliableQueue = app.Queue({
  name: 'reliable-tasks',
  worker: async (event) => {
    for (const record of event.Records) {
      const task = JSON.parse(record.body);
      
      // Simulate occasional failure
      if (Math.random() < 0.1) {
        throw new Error('Random failure for DLQ demo');
      }
      
      await processTask(task);
    }
  },
  deadLetterQueue: {
    enabled: true,
    maxRetries: 3 // Retry 3 times before sending to DLQ
  }
});
```

## Best Practices

1. **Idempotency**: Make message processing idempotent to handle duplicates
2. **Error Handling**: Always handle errors gracefully and log details
3. **Batch Size**: Adjust batch size based on processing time and memory usage
4. **Dead Letter Queue**: Always configure DLQ for production workloads
5. **Monitoring**: Log processing metrics and errors for observability
6. **Message Size**: Keep messages under 256KB (SQS limit)
7. **Visibility Timeout**: Set appropriate timeout based on processing time
8. **Retry Logic**: Use exponential backoff for external service calls