# Storage Example

This example demonstrates how to use S3 for file storage operations with automatic permissions and bucket name injection.

## Overview

The storage example shows:
- File upload (base64 encoded or plain text)
- File download with proper headers
- File deletion
- File listing
- Automatic S3 permissions and bucket name injection

## Code

```typescript
import Nimbus from '@hillock-tech/nimbus-js';

async function storageExample() {
  const app = new Nimbus({
    region: 'us-east-1',
    projectName: 'storage-app',
  });

  // Create an S3 bucket
  const fileStorage = app.Storage({
    name: 'file-uploads',
  });

  // Create an API
  const api = app.API({
    name: 'files-api',
    description: 'File upload/download API with S3',
    stage: 'prod',
  });

  // POST /files - Upload a file
  api.route('POST', '/files', async (event) => {
    const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
    const { nanoid } = require('nanoid');
    
    const body = JSON.parse(event.body || '{}');
    const bucketName = process.env.STORAGE_FILE_UPLOADS; // Auto-injected
    
    const client = new S3Client({});
    
    const fileId = nanoid();
    const fileName = body.fileName || 'file.txt';
    const content = body.content;
    const contentType = body.contentType || 'text/plain';

    try {
      await client.send(new PutObjectCommand({
        Bucket: bucketName,
        Key: `${fileId}/${fileName}`,
        Body: Buffer.from(content, body.encoding === 'base64' ? 'base64' : 'utf-8'),
        ContentType: contentType,
      }));

      return {
        statusCode: 201,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileId,
          fileName,
          key: `${fileId}/${fileName}`,
          bucket: bucketName,
        }),
      };
    } catch (error) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: error.message }),
      };
    }
  }, { cors: true });

  // GET /files/{fileId}/{fileName} - Download a file
  api.route('GET', '/files/{fileId}/{fileName}', async (event) => {
    const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
    
    const fileId = event.pathParameters?.fileId;
    const fileName = event.pathParameters?.fileName;
    const bucketName = process.env.STORAGE_FILE_UPLOADS;
    
    const client = new S3Client({});

    try {
      const response = await client.send(new GetObjectCommand({
        Bucket: bucketName,
        Key: `${fileId}/${fileName}`,
      }));

      // Read the stream
      const chunks = [];
      for await (const chunk of response.Body) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);

      return {
        statusCode: 200,
        headers: {
          'Content-Type': response.ContentType || 'application/octet-stream',
          'Content-Disposition': `attachment; filename="${fileName}"`,
        },
        body: buffer.toString('base64'),
        isBase64Encoded: true,
      };
    } catch (error) {
      if (error.name === 'NoSuchKey') {
        return {
          statusCode: 404,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'File not found' }),
        };
      }
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: error.message }),
      };
    }
  }, { cors: true });

  // DELETE /files/{fileId}/{fileName} - Delete a file
  api.route('DELETE', '/files/{fileId}/{fileName}', async (event) => {
    const { S3Client, DeleteObjectCommand } = require('@aws-sdk/client-s3');
    
    const fileId = event.pathParameters?.fileId;
    const fileName = event.pathParameters?.fileName;
    const bucketName = process.env.STORAGE_FILE_UPLOADS;
    
    const client = new S3Client({});

    try {
      await client.send(new DeleteObjectCommand({
        Bucket: bucketName,
        Key: `${fileId}/${fileName}`,
      }));

      return {
        statusCode: 204,
        body: '',
      };
    } catch (error) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: error.message }),
      };
    }
  }, { cors: true });

  // GET /files - List all files
  api.route('GET', '/files', async (event) => {
    const { S3Client, ListObjectsV2Command } = require('@aws-sdk/client-s3');
    
    const bucketName = process.env.STORAGE_FILE_UPLOADS;
    const client = new S3Client({});

    try {
      const response = await client.send(new ListObjectsV2Command({
        Bucket: bucketName,
      }));

      const files = (response.Contents || []).map(obj => ({
        key: obj.Key,
        size: obj.Size,
        lastModified: obj.LastModified,
      }));

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files, count: files.length }),
      };
    } catch (error) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: error.message }),
      };
    }
  }, { cors: true });

// Export for CLI deployment
export default app;
  console.log(`\nAPI URL: ${result.apis[0].url}`);
}

storageExample()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
```

## Setup

1. **Create project directory:**
   ```bash
   mkdir storage-example
   cd storage-example
   ```

2. **Initialize project:**
   ```bash
   npm init -y
   npm install nimbus @aws-sdk/client-s3 nanoid
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
       "destroy": "npx nimbus destroy --project storage-app --region us-east-1 --force"
     }
   }
   ```

## Deploy

```bash
npm run deploy
```

This will:
- Create an S3 bucket with a globally unique name
- Create API Gateway with file endpoints
- Deploy Lambda functions with automatic S3 permissions

## Test the API

### Upload a File

```bash
curl -X POST https://YOUR_API_URL/files \
  -H "Content-Type: application/json" \
  -d '{
    "fileName": "test.txt",
    "content": "Hello World",
    "contentType": "text/plain"
  }'
```

**Response:**
```json
{
  "fileId": "xyz123",
  "fileName": "test.txt",
  "key": "xyz123/test.txt",
  "bucket": "file-uploads-20241201-123456"
}
```

### List Files

```bash
curl https://YOUR_API_URL/files
```

**Response:**
```json
{
  "files": [
    {
      "key": "xyz123/test.txt",
      "size": 11,
      "lastModified": "2024-12-01T12:00:00.000Z"
    }
  ],
  "count": 1
}
```

### Download a File

```bash
curl https://YOUR_API_URL/files/xyz123/test.txt
```

### Delete a File

```bash
curl -X DELETE https://YOUR_API_URL/files/xyz123/test.txt
```

## Key Features Demonstrated

### 1. Automatic Resource Wiring
- S3 bucket name automatically injected as `STORAGE_FILE_UPLOADS`
- IAM permissions automatically granted for S3 operations
- Bucket name includes timestamp for global uniqueness

### 2. File Operations
- **Upload**: Base64 or plain text content
- **Download**: Proper content headers and binary handling
- **Delete**: Clean file removal
- **List**: Directory-style listing with metadata

### 3. Error Handling
- File not found (404)
- S3 operation errors (500)
- Proper error messages

## Advanced Usage

### Image Upload with Validation

```typescript
api.route('POST', '/images', async (event) => {
  const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
  const { nanoid } = require('nanoid');
  
  const body = JSON.parse(event.body || '{}');
  const bucketName = process.env.STORAGE_FILE_UPLOADS;
  
  // Validate image
  if (!body.fileName || !body.content) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'fileName and content required' })
    };
  }
  
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif'];
  if (!allowedTypes.includes(body.contentType)) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Only JPEG, PNG, and GIF images allowed' })
    };
  }
  
  // Check file size (base64 encoded size)
  const sizeInBytes = (body.content.length * 3) / 4;
  const maxSize = 5 * 1024 * 1024; // 5MB
  
  if (sizeInBytes > maxSize) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'File too large (max 5MB)' })
    };
  }
  
  const client = new S3Client({});
  const fileId = nanoid();
  const key = `images/${fileId}/${body.fileName}`;
  
  try {
    await client.send(new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: Buffer.from(body.content, 'base64'),
      ContentType: body.contentType,
      Metadata: {
        originalName: body.fileName,
        uploadedAt: new Date().toISOString()
      }
    }));
    
    return {
      statusCode: 201,
      body: JSON.stringify({
        fileId,
        fileName: body.fileName,
        key,
        url: `https://${bucketName}.s3.amazonaws.com/${key}`
      })
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
}, { cors: true });
```

### Presigned URLs for Direct Upload

```typescript
api.route('POST', '/upload-url', async (event) => {
  const { S3Client } = require('@aws-sdk/client-s3');
  const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
  const { PutObjectCommand } = require('@aws-sdk/client-s3');
  const { nanoid } = require('nanoid');
  
  const { fileName, contentType } = JSON.parse(event.body || '{}');
  const bucketName = process.env.STORAGE_FILE_UPLOADS;
  const key = `uploads/${nanoid()}/${fileName}`;
  
  const client = new S3Client({});
  
  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    ContentType: contentType
  });
  
  const signedUrl = await getSignedUrl(client, command, { expiresIn: 3600 });
  
  return {
    statusCode: 200,
    body: JSON.stringify({
      uploadUrl: signedUrl,
      key,
      expiresIn: 3600
    })
  };
}, { cors: true });
```

### File Processing Pipeline

```typescript
// Process uploaded files
const fileProcessor = app.Timer({
  name: 'file-processor',
  schedule: 'rate(5 minutes)',
  handler: async (event) => {
    const { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
    
    const client = new S3Client({});
    const bucketName = process.env.STORAGE_FILE_UPLOADS;
    
    // List unprocessed files
    const response = await client.send(new ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: 'uploads/',
      MaxKeys: 10
    }));
    
    for (const object of response.Contents || []) {
      try {
        // Get file content
        const getResponse = await client.send(new GetObjectCommand({
          Bucket: bucketName,
          Key: object.Key
        }));
        
        const content = await getResponse.Body.transformToString();
        
        // Process file (example: convert to uppercase)
        const processedContent = content.toUpperCase();
        
        // Save processed file
        const processedKey = object.Key.replace('uploads/', 'processed/');
        
        await client.send(new PutObjectCommand({
          Bucket: bucketName,
          Key: processedKey,
          Body: processedContent,
          ContentType: getResponse.ContentType,
          Metadata: {
            processedAt: new Date().toISOString(),
            originalKey: object.Key
          }
        }));
        
        console.log(`Processed ${object.Key} -> ${processedKey}`);
      } catch (error) {
        console.error(`Failed to process ${object.Key}:`, error);
      }
    }
  }
});
```

## How It Works

The `app.Storage()` resource automatically:
- Creates an S3 bucket with a globally unique name (appends timestamp)
- Grants IAM permissions for S3 operations to all Lambda functions
- Injects environment variables:
  - `STORAGE_FILE_UPLOADS` - Full bucket name
  - `STORAGE_FILE_UPLOADS_ARN` - Bucket ARN

::: info Bucket Naming
The actual bucket name will be `file-uploads-{timestamp}` to ensure global uniqueness. Your code receives this full name via the environment variable.
:::

## Architecture

```
Client
    ↓
API Gateway
    ↓
Lambda Functions
    ↓
S3 Bucket
```

## Clean Up

To destroy all resources including the S3 bucket:

```bash
npm run destroy
```

The `--force` flag is required to delete the S3 bucket and its contents.

## Next Steps

- Try the [Queue example](./queue) for async file processing
- Explore [Authentication](./auth-api) to secure file uploads
- Learn about [SQL example](./sql) for database operations

## Troubleshooting

### Common Issues

**"Bucket not found"**
- Make sure the deployment completed successfully
- Check that the environment variable `STORAGE_FILE_UPLOADS` is set

**"Access Denied"**
- Nimbus should automatically set S3 permissions
- Check CloudWatch logs for detailed error messages

**"File too large"**
- API Gateway has a 10MB payload limit
- Use presigned URLs for larger files

**CORS issues**
- Ensure `{ cors: true }` is set on routes
- Check preflight OPTIONS handling