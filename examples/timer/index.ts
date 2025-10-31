import Nimbus from '@hillock-tech/nimbus-js';

/**
 * Example: Scheduled Tasks with Timer
 * 
 * This example demonstrates how to use Timer to schedule Lambda functions
 * to run on a regular schedule using CloudWatch Events (EventBridge).
 */
async function timerExample() {
    const app = new Nimbus({
        region: 'us-east-1',
        projectName: 'timer-app',
    });

    // Create a KV store for tracking task executions
    const kv = app.KV({ name: 'task-logs' });

    // Create a timer that runs every 5 minutes
    const frequentTimer = app.Timer({
        name: 'frequent-task',
        schedule: 'rate(5 minutes)',
        description: 'Runs every 5 minutes to check system health',
        handler: async (event: any) => {
            const timestamp = new Date().toISOString();
            const taskId = Math.random().toString(36).substring(7);

            console.log(`Frequent task executed at ${timestamp}`);

            // Log the execution to KV store
            // KV store is automatically available as environment variable
            const tableName = process.env.KV_TASK_LOGS;
            console.log(`Logging to table: ${tableName}`);

            // Simulate some work
            const healthCheck = {
                taskId,
                type: 'health-check',
                timestamp,
                status: 'completed',
                details: {
                    memoryUsage: process.memoryUsage(),
                    uptime: process.uptime(),
                }
            };

            return {
                statusCode: 200,
                body: JSON.stringify({
                    message: 'Health check completed',
                    task: healthCheck,
                }),
            };
        },
    });

    // Create a timer that runs daily at 2 AM UTC using cron expression
    const dailyTimer = app.Timer({
        name: 'daily-cleanup',
        schedule: 'cron(0 2 * * ? *)', // 2 AM UTC every day
        description: 'Daily cleanup task',
        handler: async (event: any) => {
            const timestamp = new Date().toISOString();

            console.log(`Daily cleanup task executed at ${timestamp}`);

            // Simulate cleanup work
            const cleanupResults = {
                timestamp,
                type: 'daily-cleanup',
                itemsProcessed: Math.floor(Math.random() * 1000),
                itemsDeleted: Math.floor(Math.random() * 100),
                duration: Math.floor(Math.random() * 30000), // milliseconds
            };

            return {
                statusCode: 200,
                body: JSON.stringify({
                    message: 'Daily cleanup completed',
                    results: cleanupResults,
                }),
            };
        },
    });

    // Create a timer that runs every Monday at 9 AM UTC
    const weeklyTimer = app.Timer({
        name: 'weekly-report',
        schedule: 'cron(0 9 ? * MON *)', // 9 AM UTC every Monday
        description: 'Weekly report generation',
        handler: async (event: any) => {
            const timestamp = new Date().toISOString();

            console.log(`Weekly report task executed at ${timestamp}`);

            // Simulate report generation
            const reportData = {
                timestamp,
                type: 'weekly-report',
                week: new Date().toISOString().slice(0, 10), // YYYY-MM-DD
                metrics: {
                    totalTasks: Math.floor(Math.random() * 10000),
                    successRate: (Math.random() * 0.1 + 0.9).toFixed(3), // 90-100%
                    avgDuration: Math.floor(Math.random() * 5000), // milliseconds
                }
            };

            return {
                statusCode: 200,
                body: JSON.stringify({
                    message: 'Weekly report generated',
                    report: reportData,
                }),
            };
        },
    });

    // Create a disabled timer (can be enabled later)
    const maintenanceTimer = app.Timer({
        name: 'maintenance-window',
        schedule: 'cron(0 3 ? * SUN *)', // 3 AM UTC every Sunday
        description: 'Maintenance window - currently disabled',
        enabled: false, // This timer won't trigger until enabled
        handler: async (event: any) => {
            console.log('Maintenance window started');

            // Simulate maintenance tasks
            return {
                statusCode: 200,
                body: JSON.stringify({
                    message: 'Maintenance completed',
                    timestamp: new Date().toISOString(),
                }),
            };
        },
    });

    // Deploy everything!
    const result = await app.deploy();

    console.log('\n✅ Timer example deployed successfully!');
    console.log(`\nTimers created:`);

    if (result.timers) {
        for (const timer of result.timers) {
            console.log(`  - ${timer.name}: ${timer.schedule}`);
        }
    }

    console.log(`\nSchedule expressions used:`);
    console.log(`  - rate(5 minutes)           - Every 5 minutes`);
    console.log(`  - cron(0 2 * * ? *)         - Daily at 2 AM UTC`);
    console.log(`  - cron(0 9 ? * MON *)       - Every Monday at 9 AM UTC`);
    console.log(`  - cron(0 3 ? * SUN *)       - Every Sunday at 3 AM UTC (disabled)`);

    console.log(`\nNote: The maintenance timer is disabled and won't execute.`);
    console.log(`You can enable it by setting enabled: true and redeploying.`);
}

// Run the example
if (require.main === module) {
    timerExample()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error('Error:', error);
            process.exit(1);
        });
}

export default timerExample;