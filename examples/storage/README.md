# S3 Storage Example

This example demonstrates how to use Nimbus with S3 for file storage operations.

## Features

- Upload files (base64 encoded or plain text)
- Download files
- Delete files
- List all files in bucket
- Automatic S3 permissions and bucket name injection

## Setup

```bash
npm install
```

## Deploy

```bash
npm run deploy
```

This will:
- Create an S3 bucket named `file-uploads`
- Create an API Gateway with file endpoints
- Deploy Lambda functions with automatic S3 permissions

## API Endpoints

### Upload a File

```bash
curl -X POST https://your-api.execute-api.us-east-1.amazonaws.com/prod/files \
  -H "Content-Type: application/json" \
  -d '{
    "fileName": "test.txt",
    "content": "Hello World",
    "contentType": "text/plain"
  }'
```

Response:
```json
{
  "fileId": "xyz123",
  "fileName": "test.txt",
  "key": "xyz123/test.txt",
  "bucket": "file-uploads"
}
```

### List Files

```bash
curl https://your-api.execute-api.us-east-1.amazonaws.com/prod/files
```

Response:
```json
{
  "files": [
    {
      "key": "xyz123/test.txt",
      "size": 11,
      "lastModified": "2025-10-29T12:00:00.000Z"
    }
  ],
  "count": 1
}
```

### Download a File

```bash
curl https://your-api.execute-api.us-east-1.amazonaws.com/prod/files/xyz123/test.txt
```

### Delete a File

```bash
curl -X DELETE https://your-api.execute-api.us-east-1.amazonaws.com/prod/files/xyz123/test.txt
```

## How It Works

The `app.Storage()` resource automatically:
- Creates an S3 bucket with a globally unique name (appends timestamp)
- Grants IAM permissions for S3 operations to all Lambda functions
- Injects environment variables:
  - `STORAGE_FILE_UPLOADS` - Full bucket name (e.g., `file-uploads-20251029-120000`)
  - `STORAGE_FILE_UPLOADS_ARN` - Bucket ARN

**Note:** The actual bucket name will be `file-uploads-{timestamp}` to ensure global uniqueness. Your code receives this full name via the environment variable - no need to manually configure it!

No need to manually configure permissions or pass bucket names - Nimbus handles it automatically!

## Environment Variables

Your Lambda functions have access to:

```typescript
const bucketName = process.env.STORAGE_FILE_UPLOADS; // "file-uploads-20251029-120000"
const bucketArn = process.env.STORAGE_FILE_UPLOADS_ARN; // "arn:aws:s3:::file-uploads-20251029-120000"
```

The bucket name includes a timestamp suffix for global uniqueness.

## Cleanup

To destroy all resources:

```bash
npx nimbus destroy --project storage-app --region us-east-1 --force
```

The `--force` flag is required to delete the S3 bucket and its contents.
