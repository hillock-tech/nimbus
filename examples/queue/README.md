# Queue Example

Demonstrates reliable message processing with SQS and dead letter queues.

## What it does

- API accepts tasks and queues them
- Worker function processes tasks asynchronously  
- Failed tasks retry 3 times, then go to dead letter queue
- Results stored in database

## How it works

1. **Submit task** → API puts message in queue
2. **Worker processes** → Lambda function triggered automatically
3. **Success** → Result saved to database
4. **Failure** → Retries 3 times, then goes to DLQ

## Deploy

```bash
npm install
npm run deploy
```

## Test

Submit a task:
```bash
curl -X POST https://your-api.com/tasks \
  -H "Content-Type: application/json" \
  -d '{"name": "Process Data", "data": "some data"}'
```

Submit a failing task (for DLQ demo):
```bash
curl -X POST https://your-api.com/tasks \
  -H "Content-Type: application/json" \
  -d '{"name": "Failing Task", "shouldFail": true}'
```

Check results:
```bash
curl https://your-api.com/tasks
```

Get specific task:
```bash
curl https://your-api.com/tasks/1234567890
```

## Reliability Features

- **Dead Letter Queue** - Failed messages after 3 retries
- **Automatic Retries** - Transient failures handled automatically
- **Error Isolation** - One bad message doesn't stop others
- **Monitoring** - CloudWatch metrics for queue depth, errors

## Check Dead Letter Queue

In AWS Console:
1. Go to SQS
2. Find `dev-tasks-dlq` queue
3. Check for failed messages

## Clean up

```bash
npm run destroy:force
```

## What you get

- ✅ SQS queue with worker Lambda
- ✅ Dead letter queue for failed messages
- ✅ Automatic retry logic (3 attempts)
- ✅ Database for storing results
- ✅ API for submitting tasks
- ✅ CloudWatch monitoring

**Perfect for:** Background jobs, email sending, image processing, data pipelines.