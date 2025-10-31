# Storage

The Storage class represents an S3 bucket for file storage operations.

> **Performance Tip**: Use the `init` pattern in your API or Function definitions to initialize AWS SDK clients once per container instead of on every request. This can improve performance by 50-80% for warm invocations.

## Creation

```typescript
const storage = app.Storage(config: StorageConfig)
```

### StorageConfig

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `name` | `string` | ✅ | Bucket name (will be made globally unique) |
| `versioning` | `boolean` | ❌ | Enable versioning |
| `encryption` | `string` | ❌ | Server-side encryption ('AES256' or 'aws:kms') |
| `lifecycle` | `object` | ❌ | Lifecycle rules |

### Example

```typescript
const fileStorage = app.Storage({
  name: 'file-uploads',
  versioning: true,
  encryption: 'AES256'
});
```

## Environment Variables

Storage buckets automatically inject environment variables:

- `STORAGE_{NAME}` - Bucket name (e.g., `STORAGE_FILE_UPLOADS`)
- `STORAGE_{NAME}_ARN` - Bucket ARN

::: tip Bucket Naming
Nimbus automatically appends a timestamp to bucket names to ensure global uniqueness. For example, `file-uploads` becomes `file-uploads-20241201-123456`.
:::

## Basic Operations

### Upload File

```typescript
// Create API with S3 client initialization
const api = nimbus.API({
  name: 'files-api',
  init: () => {
    const { S3Client } = require('@aws-sdk/client-s3');
    global.s3Client = new S3Client({});
  }
});

api.route('POST', '/files', async (event) => {
  const { PutObjectCommand } = require('@aws-sdk/client-s3');
  const { nanoid } = require('nanoid');
  
  const body = JSON.parse(event.body || '{}');
  const bucketName = process.env.STORAGE_FILE_UPLOADS; // Auto-injected
  
  const fileId = nanoid();
  const fileName = body.fileName || 'file.txt';
  const content = body.content; // Base64 or plain text
  const contentType = body.contentType || 'text/plain';

  try {
    await global.s3Client.send(new PutObjectCommand({
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
```

### Download File

```typescript
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
```

### List Files

```typescript
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
```

### Delete File

```typescript
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
```

## Advanced Operations

### Presigned URLs

Generate presigned URLs for direct client uploads:

```typescript
api.route('POST', '/files/upload-url', async (event) => {
  const { S3Client } = require('@aws-sdk/client-s3');
  const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
  const { PutObjectCommand } = require('@aws-sdk/client-s3');
  
  const { fileName, contentType } = JSON.parse(event.body || '{}');
  const bucketName = process.env.STORAGE_FILE_UPLOADS;
  const key = `uploads/${Date.now()}-${fileName}`;
  
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
});
```

### Multipart Upload

For large files, use multipart upload:

```typescript
api.route('POST', '/files/multipart/start', async (event) => {
  const { S3Client, CreateMultipartUploadCommand } = require('@aws-sdk/client-s3');
  
  const { fileName, contentType } = JSON.parse(event.body || '{}');
  const bucketName = process.env.STORAGE_FILE_UPLOADS;
  const key = `large-files/${Date.now()}-${fileName}`;
  
  const client = new S3Client({});
  
  const response = await client.send(new CreateMultipartUploadCommand({
    Bucket: bucketName,
    Key: key,
    ContentType: contentType
  }));
  
  return {
    statusCode: 200,
    body: JSON.stringify({
      uploadId: response.UploadId,
      key
    })
  };
});
```

### File Processing

Process files after upload using S3 events:

```typescript
const processor = app.Function({
  name: 'file-processor',
  handler: async (event) => {
    for (const record of event.Records) {
      const bucket = record.s3.bucket.name;
      const key = record.s3.object.key;
      
      console.log(`Processing ${key} from ${bucket}`);
      
      // Download file
      const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
      const client = new S3Client({});
      
      const response = await client.send(new GetObjectCommand({
        Bucket: bucket,
        Key: key
      }));
      
      // Process file content
      const content = await response.Body.transformToString();
      
      // Example: Extract metadata, resize image, etc.
      console.log(`File size: ${content.length} bytes`);
    }
  }
});

// Configure S3 to trigger the function (done automatically by Nimbus)
```

## File Types and Handling

### Text Files

```typescript
// Upload text file
const textContent = "Hello, World!";
await client.send(new PutObjectCommand({
  Bucket: bucketName,
  Key: 'documents/hello.txt',
  Body: textContent,
  ContentType: 'text/plain'
}));
```

### JSON Files

```typescript
// Upload JSON data
const jsonData = { name: 'John', age: 30 };
await client.send(new PutObjectCommand({
  Bucket: bucketName,
  Key: 'data/user.json',
  Body: JSON.stringify(jsonData),
  ContentType: 'application/json'
}));
```

### Binary Files

```typescript
// Upload binary file (base64 encoded)
const binaryData = Buffer.from(base64String, 'base64');
await client.send(new PutObjectCommand({
  Bucket: bucketName,
  Key: 'images/photo.jpg',
  Body: binaryData,
  ContentType: 'image/jpeg'
}));
```

## Security and Access Control

### Public Read Access

```typescript
const publicStorage = app.Storage({
  name: 'public-assets',
  publicRead: true // Makes objects publicly readable
});
```

### Signed URLs for Private Access

```typescript
api.route('GET', '/files/{key}/download-url', async (event) => {
  const { S3Client } = require('@aws-sdk/client-s3');
  const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
  const { GetObjectCommand } = require('@aws-sdk/client-s3');
  
  const key = event.pathParameters?.key;
  const bucketName = process.env.STORAGE_FILE_UPLOADS;
  
  const client = new S3Client({});
  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: key
  });
  
  const signedUrl = await getSignedUrl(client, command, { expiresIn: 3600 });
  
  return {
    statusCode: 200,
    body: JSON.stringify({
      downloadUrl: signedUrl,
      expiresIn: 3600
    })
  };
});
```

## Lifecycle Management

Configure automatic cleanup of old files:

```typescript
const storage = app.Storage({
  name: 'temp-files',
  lifecycle: {
    rules: [
      {
        id: 'delete-old-files',
        status: 'Enabled',
        expiration: {
          days: 30 // Delete files after 30 days
        }
      },
      {
        id: 'archive-old-files',
        status: 'Enabled',
        transitions: [
          {
            days: 7,
            storageClass: 'STANDARD_IA' // Move to Infrequent Access after 7 days
          },
          {
            days: 30,
            storageClass: 'GLACIER' // Move to Glacier after 30 days
          }
        ]
      }
    ]
  }
});
```

## Error Handling

```typescript
api.route('POST', '/files', async (event) => {
  const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
  
  try {
    const body = JSON.parse(event.body || '{}');
    
    if (!body.fileName || !body.content) {
      return {
        statusCode: 400,
        body: JSON.stringify({ 
          error: 'fileName and content are required' 
        })
      };
    }
    
    const client = new S3Client({});
    const bucketName = process.env.STORAGE_FILE_UPLOADS;
    
    await client.send(new PutObjectCommand({
      Bucket: bucketName,
      Key: body.fileName,
      Body: body.content
    }));
    
    return {
      statusCode: 201,
      body: JSON.stringify({ success: true })
    };
  } catch (error) {
    console.error('S3 error:', error);
    
    if (error.name === 'NoSuchBucket') {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Storage bucket not found' })
      };
    }
    
    if (error.name === 'AccessDenied') {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: 'Access denied' })
      };
    }
    
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Upload failed' })
    };
  }
});
```

## Best Practices

1. **File Organization**: Use prefixes to organize files (e.g., `users/123/avatar.jpg`)
2. **Content Types**: Always set appropriate Content-Type headers
3. **File Size Limits**: Validate file sizes before upload
4. **Security**: Use presigned URLs for direct client uploads
5. **Lifecycle**: Configure lifecycle rules to manage costs
6. **Monitoring**: Monitor storage usage and costs
7. **Backup**: Enable versioning for important data
8. **Access Control**: Use IAM policies and bucket policies appropriately

## Common Patterns

### Image Upload and Processing

```typescript
// Upload endpoint
api.route('POST', '/images', async (event) => {
  const { fileName, imageData } = JSON.parse(event.body || '{}');
  const key = `images/${Date.now()}-${fileName}`;
  
  await client.send(new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    Body: Buffer.from(imageData, 'base64'),
    ContentType: 'image/jpeg'
  }));
  
  return {
    statusCode: 201,
    body: JSON.stringify({ key })
  };
});

// Processing function (triggered by S3 events)
const imageProcessor = app.Function({
  name: 'image-processor',
  handler: async (event) => {
    // Resize, optimize, generate thumbnails, etc.
  }
});
```

### Document Storage

```typescript
const documents = app.Storage({
  name: 'documents',
  versioning: true, // Keep document history
  encryption: 'AES256'
});

api.route('POST', '/documents', async (event) => {
  const { title, content, userId } = JSON.parse(event.body || '{}');
  const key = `users/${userId}/documents/${Date.now()}-${title}.txt`;
  
  await client.send(new PutObjectCommand({
    Bucket: process.env.STORAGE_DOCUMENTS,
    Key: key,
    Body: content,
    ContentType: 'text/plain',
    Metadata: {
      userId,
      title,
      uploadedAt: new Date().toISOString()
    }
  }));
  
  return {
    statusCode: 201,
    body: JSON.stringify({ key })
  };
});
```