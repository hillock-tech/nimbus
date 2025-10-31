import Nimbus from '@hillock-tech/nimbus-js';

/**
 * Example: S3 Storage with file upload/download
 */
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

  // POST /files - Upload a file (base64 encoded)
  api.route('POST', '/files', async (event: any) => {
    const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
    const { nanoid } = require('nanoid');
    
    const body = JSON.parse(event.body || '{}');
    const bucketName = process.env.STORAGE_FILE_UPLOADS; // Auto-injected
    
    const client = new S3Client({});
    
    const fileId = nanoid();
    const fileName = body.fileName || 'file.txt';
    const content = body.content; // Base64 or plain text
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
    } catch (error: any) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: error.message }),
      };
    }
  }, { cors: true });

  // GET /files/{fileId}/{fileName} - Download a file
  api.route('GET', '/files/{fileId}/{fileName}', async (event: any) => {
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
      const chunks: any[] = [];
      for await (const chunk of response.Body as any) {
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
    } catch (error: any) {
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
  api.route('DELETE', '/files/{fileId}/{fileName}', async (event: any) => {
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
    } catch (error: any) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: error.message }),
      };
    }
  }, { cors: true });

  // GET /files - List all files
  api.route('GET', '/files', async (event: any) => {
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
    } catch (error: any) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: error.message }),
      };
    }
  }, { cors: true });

  // Deploy everything!
// Export the nimbus instance for CLI to deploy
export default app;
