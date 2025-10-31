import Nimbus from '@hillock-tech/nimbus-js';

/**
 * Example: Multi-Stage Deployments
 * 
 * This example demonstrates how to deploy the same application
 * to multiple environments (dev, staging, prod) with different configurations.
 */
async function multiStageExample() {
    // Get stage from environment variable or default to 'dev'
    const stage = process.env.STAGE || 'dev';

    console.log(`🚀 Deploying to stage: ${stage}`);

    const app = new Nimbus({
        region: 'us-east-1',
        projectName: 'multi-stage-app',
        stage: stage, // This creates separate deployments per stage
        tracing: stage === 'prod', // Enable tracing only in production
    });

    // Stage-specific configuration
    const config = {
        dev: {
            memorySize: 128,
            timeout: 30,
            customDomain: undefined, // No custom domain for dev
        },
        staging: {
            memorySize: 256,
            timeout: 60,
            customDomain: 'staging-api.example.com',
        },
        prod: {
            memorySize: 512,
            timeout: 120,
            customDomain: 'api.example.com',
        }
    }[stage] || {
        memorySize: 128,
        timeout: 30,
        customDomain: undefined,
    };

    // Create resources - each stage gets its own isolated resources
    const kv = app.KV({
        name: `users-${stage}`, // Stage-specific table names
        primaryKey: 'id'
    });

    const api = app.API({
        name: `api-${stage}`,
        stage: stage,
        customDomain: config.customDomain,
    });

    // API routes with stage-aware configuration
    api.route('GET', '/health', async (event) => {
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                status: 'healthy',
                stage: stage,
                timestamp: new Date().toISOString(),
                environment: {
                    tableName: process.env.KV_USERS_DEV || process.env.KV_USERS_STAGING || process.env.KV_USERS_PROD,
                    region: process.env.AWS_REGION,
                }
            }),
        };
    }, { cors: true });

    api.route('GET', '/users', async (event) => {
        // In a real app, you'd query the DynamoDB table here
        const tableName = process.env[`KV_USERS_${stage.toUpperCase()}`];

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: `Users from ${stage} environment`,
                tableName,
                users: [
                    { id: '1', name: `Test User (${stage})`, email: `user@${stage}.example.com` }
                ]
            }),
        };
    }, { cors: true });

    api.route('POST', '/users', async (event) => {
        const user = JSON.parse(event.body || '{}');

        return {
            statusCode: 201,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: `User created in ${stage} environment`,
                user: {
                    ...user,
                    id: Math.random().toString(36).substring(7),
                    stage: stage,
                    createdAt: new Date().toISOString(),
                }
            }),
        };
    }, {
        cors: true,
        // Stage-specific permissions (example)
        permissions: stage === 'prod' ? [
            {
                Effect: 'Allow',
                Action: 'ses:SendEmail',
                Resource: '*'
            }
        ] : undefined
    });

    // Stage-specific scheduled tasks
    if (stage === 'prod') {
        app.Timer({
            name: 'daily-cleanup',
            schedule: 'cron(0 2 * * ? *)', // 2 AM UTC daily
            handler: async (event) => {
                console.log('Running daily cleanup in production');
                return { statusCode: 200, body: 'Cleanup completed' };
            },
        });
    } else {
        app.Timer({
            name: 'test-timer',
            schedule: 'rate(1 hour)', // Every hour for non-prod
            handler: async (event) => {
                console.log(`Running test timer in ${stage}`);
                return { statusCode: 200, body: 'Test timer executed' };
            },
        });
    }

    // Deploy everything!
    const result = await app.deploy();

    console.log(`\n✅ Multi-stage deployment completed for stage: ${stage}!`);
    console.log(`\nDeployment details:`);
    console.log(`  Stage: ${stage}`);
    console.log(`  Region: us-east-1`);
    console.log(`  API URL: ${result.apis[0].url}`);

    if (result.apis[0].customDomain) {
        console.log(`  Custom Domain: https://${result.apis[0].customDomain}`);
    }

    console.log(`\nTest endpoints:`);
    console.log(`  GET  ${result.apis[0].url}/health`);
    console.log(`  GET  ${result.apis[0].url}/users`);
    console.log(`  POST ${result.apis[0].url}/users`);

    console.log(`\nTo deploy to different stages:`);
    console.log(`  STAGE=dev npm run deploy`);
    console.log(`  STAGE=staging npm run deploy`);
    console.log(`  STAGE=prod npm run deploy`);

    console.log(`\nTo destroy a specific stage:`);
    console.log(`  npx nimbus destroy --project multi-stage-app --region us-east-1 --stage ${stage}`);
}

// Run the example
if (require.main === module) {
    multiStageExample()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error('Error:', error);
            process.exit(1);
        });
}

export default multiStageExample;