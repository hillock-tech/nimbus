import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts';
import { API } from './api';
import { NimbusFunction } from './function';
import { Role } from './role';
import { NoSQL } from './nosql';
import { SQL } from './sql';
import { Storage } from './storage';
import { Queue } from './queue';
import { Timer } from './timer';
import { Secret } from './secrets';
import { Parameter } from './parameter-store';
import { StateManager } from './state';
import runtime from './runtime';

import {
  NimbusOptions,
  DeploymentResult,
  APIOptions,
  FunctionOptions,
  NoSQLOptions,
  KVOptions,
  SQLOptions,
  StorageOptions,
  QueueOptions,
  TimerOptions,
  SecretOptions,
  ParameterOptions,
  HttpMethod,
  LambdaHandler,
} from './types-v2';

export class Nimbus {
  private region: string;
  private accountId?: string;
  private projectName: string;
  private stage: string;
  private tracing: boolean;
  private apis: API[] = [];
  private functions: NimbusFunction[] = [];
  private nosqlStores: NoSQL[] = [];
  private sqlDatabases: SQL[] = [];
  private storageBuckets: Storage[] = [];
  private queues: Queue[] = [];
  private timers: Timer[] = [];
  private secrets: Secret[] = [];
  private parameters: Parameter[] = [];
  private roles: Map<string, Role> = new Map();
  private stsClient: STSClient;
  private stateManager: StateManager;

  constructor(options: NimbusOptions = {}) {
    this.region = options.region || 'us-east-1';
    this.accountId = options.accountId;
    this.projectName = options.projectName || 'nimbus-app';
    this.stage = options.stage || 'dev';
    this.tracing = options.tracing || false;
    this.stsClient = new STSClient({ region: this.region });
    this.stateManager = new StateManager(this.projectName, this.stage, this.region);
  }

  API(options: APIOptions): API {
    const api = new API(
      { ...options, name: `${this.stage}-${options.name}`, tracing: this.tracing },
      this.region,
      this.accountId || ''
    );
    this.apis.push(api);
    return api;
  }

  /**
   * Create an API with convenience method (alias for API)
   */
  api(options: APIOptions): API {
    return this.API(options);
  }

  Function(options: FunctionOptions): NimbusFunction {
    const func = new NimbusFunction(
      { ...options, name: `${this.stage}-${options.name}`, tracing: this.tracing },
      this.region,
      this.accountId || ''
    );
    this.functions.push(func);
    return func;
  }

  /**
   * Create a NoSQL store
   */
  NoSQL(options: NoSQLOptions): NoSQL {
    const nosql = new NoSQL(
      { ...options, name: `${this.stage}-${options.name}`, encryption: options.encryption ?? true },
      this.region,
      this.accountId || ''
    );
    this.nosqlStores.push(nosql);
    return nosql;
  }

  /**
   * Create a KV store (alias for NoSQL for backward compatibility)
   */
  KV(options: NoSQLOptions): NoSQL {
    return this.NoSQL(options);
  }

  SQL(options: SQLOptions): SQL {
    const sql = new SQL(
      { ...options, name: `${this.stage}-${options.name}` },
      this.region,
      this.accountId || ''
    );
    this.sqlDatabases.push(sql);
    return sql;
  }

  Storage(options: StorageOptions): Storage {
    const storage = new Storage(
      { ...options, name: `${this.stage}-${options.name}` },
      this.region,
      this.accountId || ''
    );
    this.storageBuckets.push(storage);
    return storage;
  }

  Queue(options: QueueOptions): Queue {
    const queue = new Queue(
      { ...options, name: `${this.stage}-${options.name}` },
      this.region,
      this.accountId || ''
    );
    this.queues.push(queue);
    return queue;
  }

  Timer(options: TimerOptions): Timer {
    if (!Timer.validateSchedule(options.schedule)) {
      throw new Error(`Invalid schedule expression: ${options.schedule}. Use 'rate(...)' or 'cron(...)' format.`);
    }

    const timer = new Timer(
      { ...options, name: `${this.stage}-${options.name}` },
      this.region,
      this.accountId || ''
    );
    this.timers.push(timer);
    return timer;
  }

  Secret(options: SecretOptions): Secret {
    const secret = new Secret(
      { ...options, name: `${this.stage}-${options.name}` },
      this.region,
      this.accountId || ''
    );
    this.secrets.push(secret);
    return secret;
  }

  Parameter(options: ParameterOptions): Parameter {
    // Ensure parameter name starts with /
    const paramName = options.name.startsWith('/') 
      ? `/${this.stage}${options.name}`
      : `/${this.stage}/${options.name}`;

    const parameter = new Parameter(
      { ...options, name: paramName },
      this.region,
      this.accountId || ''
    );
    this.parameters.push(parameter);
    return parameter;
  }

  Role(name?: string): Role {
    const roleName = name || `${this.stage}-${this.projectName}-lambda-role`;
    if (!this.roles.has(roleName)) {
      const role = new Role(roleName, this.region, this.accountId || '');
      this.roles.set(roleName, role);
    }
    return this.roles.get(roleName)!;
  }

  async deploy(): Promise<DeploymentResult> {
    console.log('[DEPLOY] Starting Nimbus deployment...\n');
    const result: DeploymentResult = {
      apis: [],
      functions: [],
      nosqlStores: [],
      sqlDatabases: [],
      storageBuckets: [],
      queues: [],
      timers: [],
      roles: [],
    };

    try {
      await this.stateManager.acquireLock();

      if (!this.accountId) {
        await this.resolveAccountId();
      }

      // propagate accountId
      [...this.apis, ...this.timers, ...this.functions].forEach(r => r.setAccountId?.(this.accountId!));

      const existingState = await this.stateManager.readState();
      if (existingState) {
        console.log(`[STATE] Found existing deployment for "${this.projectName}"`);
        // Load existing state into memory for addResource calls
        await this.stateManager.initialize(this.projectName, this.region, this.accountId!);
      } else {
        await this.stateManager.initialize(this.projectName, this.region, this.accountId!);
      }

      // NoSQL
      for (const nosql of this.nosqlStores) {
        console.log(`[NoSQL] ${nosql.getName()}`);
        await nosql.provision();
        result.nosqlStores.push({ name: nosql.getName(), arn: nosql.getArn() });
      }

      // SQL
      for (const sql of this.sqlDatabases) {
        console.log(`[SQL] ${sql.getName()}`);
        await sql.provision();
        result.sqlDatabases.push({
          name: sql.getName(),
          arn: sql.getArn(),
          identifier: sql.getIdentifier(),
          endpoint: sql.getEndpoint(),
        });
      }

      // Storage
      for (const storage of this.storageBuckets) {
        console.log(`[STORAGE] ${storage.getName()}`);
        await storage.provision();
        result.storageBuckets.push({
          name: storage.getBucketName(),
          arn: storage.getArn(),
        });
      }

      // Queue
      for (const queue of this.queues) {
        console.log(`[QUEUE] ${queue.getName()}`);
        await queue.provision();
        if (!result.queues) result.queues = [];
        result.queues.push({
          name: queue.getName(),
          arn: queue.getArn(),
          url: queue.getQueueUrl()!,
        });
      }

      // Timer
      for (const timer of this.timers) {
        console.log(`[TIMER] ${timer.getName()}`);
        await timer.provision();
        if (!result.timers) result.timers = [];
        result.timers.push({
          name: timer.getName(),
          arn: timer.getArn(),
          schedule: (timer as any).schedule,
        });
      }

      // Secrets
      for (const secret of this.secrets) {
        console.log(`[SECRET] ${secret.getName()}`);
        await secret.provision();
        if (!result.secrets) result.secrets = [];
        result.secrets.push({
          name: secret.getName(),
          arn: secret.getArn(),
        });
        
        // Save secret to state
        await this.stateManager.addResource({
          id: secret.getArn(),
          type: 'secret',
          name: secret.getName(),
          arn: secret.getArn(),
          region: this.region,
          createdAt: new Date().toISOString(),
        });
      }

      // Parameters
      for (const parameter of this.parameters) {
        console.log(`[PARAMETER] ${parameter.getName()}`);
        await parameter.provision();
        if (!result.parameters) result.parameters = [];
        result.parameters.push({
          name: parameter.getName(),
          arn: parameter.getArn(),
        });
        
        // Save parameter to state
        await this.stateManager.addResource({
          id: parameter.getArn(),
          type: 'parameter',
          name: parameter.getName(),
          arn: parameter.getArn(),
          region: this.region,
          createdAt: new Date().toISOString(),
        });
      }

      const sharedRole = this.Role();

      // Collect and link all functions
      const allFunctions = new Set<NimbusFunction>(this.functions);
      for (const api of this.apis) {
        api.createFunctions();
        api.getFunctions().forEach(f => allFunctions.add(f));
      }
      this.queues.forEach(q => {
        const f = q.createWorkerFunction(this.projectName);
        if (f) allFunctions.add(f);
      });
      this.timers.forEach(t => {
        const f = t.createWorkerFunction(this.projectName);
        if (f) allFunctions.add(f);
      });

      for (const func of allFunctions) {
        func.setRole(sharedRole);
        [...this.nosqlStores, ...this.sqlDatabases, ...this.storageBuckets, ...this.queues, ...this.timers, ...this.secrets, ...this.parameters].forEach(r =>
          func.use(r)
        );
        func.getResources().forEach(r => sharedRole.addResource(r));
      }

      if (this.tracing) sharedRole.enableXRayTracing();

      console.log('[IAM] Provisioning shared role...');
      const roleArn = await sharedRole.provision();
      
      // Save role to state
      await this.stateManager.addResource({
        id: roleArn,
        type: 'role',
        name: sharedRole.getName(),
        arn: roleArn,
        region: this.region,
        createdAt: new Date().toISOString(),
      });
      result.roles.push({ name: sharedRole.getName(), arn: roleArn });

      for (const func of this.functions) {
        console.log(`[LAMBDA] ${func.getName()}`);
        await func.provision(roleArn);
        result.functions.push({ name: func.getName(), arn: func.getArn() });
        
        // Save function to state
        await this.stateManager.addResource({
          id: func.getArn(),
          type: 'function',
          name: func.getName(),
          arn: func.getArn(),
          region: this.region,
          createdAt: new Date().toISOString(),
        });
      }

      for (const api of this.apis) {
        console.log(`[API] ${api.getName()}`);
        await api.provision(sharedRole);
        result.apis.push({
          name: api.getName(),
          id: api.getId()!,
          url: api.getUrl(),
          defaultUrl: api.getDefaultUrl(),
          customDomain: api.getCustomDomain(),
        });
        
        // Save API to state
        await this.stateManager.addResource({
          id: api.getId()!,
          type: 'api',
          name: api.getName(),
          region: this.region,
          createdAt: new Date().toISOString(),
          metadata: { 
            apiId: api.getId()!, 
            url: api.getUrl(),
            customDomain: api.getCustomDomain(),
          },
        });
        
        // Save API functions to state
        for (const func of api.getFunctions()) {
          await this.stateManager.addResource({
            id: func.getArn(),
            type: 'function',
            name: func.getName(),
            arn: func.getArn(),
            region: this.region,
            createdAt: new Date().toISOString(),
            metadata: { apiName: api.getName() },
          });
        }
      }

      console.log('\n[SUCCESS] Deployment complete!\n');
      this.printDeploymentSummary(result);
      this.cleanup();
      return result;
    } catch (error) {
      console.error('[ERROR] Deployment failed:', error);
      throw error;
    } finally {
      await this.stateManager.releaseLock();
    }
  }

  private cleanup(): void {
    this.stsClient.destroy();
    for (const nosql of this.nosqlStores) (nosql as any).dynamoClient?.destroy?.();
    for (const sql of this.sqlDatabases) (sql as any).rdsClient?.destroy?.();
    for (const s of this.storageBuckets) (s as any).s3Client?.destroy?.();
    for (const a of this.apis) {
      (a as any).apiGatewayClient?.destroy?.();
      (a as any).acmClient?.destroy?.();
    }
    for (const f of this.functions) (f as any).lambdaClient?.destroy?.();
    for (const r of this.roles.values()) (r as any).iamClient?.destroy?.();
  }

  private async resolveAccountId(): Promise<void> {
    const res = await this.stsClient.send(new GetCallerIdentityCommand({}));
    this.accountId = res.Account;
  }

  private printDeploymentSummary(result: DeploymentResult): void {
    console.log('\nSUMMARY Deployment Summary\n──────────────────────────────');
    const sections = [
      ['APIs', result.apis],
      ['NoSQL Stores', result.nosqlStores],
      ['SQL Databases', result.sqlDatabases],
      ['Storage Buckets', result.storageBuckets],
      ['Queues', result.queues],
      ['Timers', result.timers],
      ['Functions', result.functions],
      ['IAM Roles', result.roles],
    ];

    for (const [label, list] of sections) {
      if (list && list.length > 0) {
        console.log(`\n${label}:`);
        for (const item of list) {
          if (typeof item === 'object' && item && 'name' in item) {
            console.log(`  - ${item.name}`);
            if ('url' in item && item.url) console.log(`    URL: ${item.url}`);
            if ('schedule' in item && item.schedule) console.log(`    Schedule: ${item.schedule}`);
          }
        }
      }
    }
  }

  /**
   * Destroy all deployed resources
   * @param options.force - If true, also destroys data resources (KV, SQL, Storage)
   */
  async destroy(options?: { force?: boolean }): Promise<void> {
    const force = options?.force || false;
    console.log('[DESTROY] Starting Nimbus destroy...\n');

    await this.stateManager.acquireLock();
    try {
      // Load state
      const state = await this.stateManager.readState();
      if (!state) {
        console.log('No state found. Nothing to destroy.');
        return;
      }

      // Get AWS account ID if not set
      if (!this.accountId) {
        await this.resolveAccountId();
      }

      // Delete APIs (which also deletes their functions)
      console.log('\n[API] Destroying APIs...');
      for (const resource of state.resources.filter(r => r.type === 'api')) {
        const api = new API(
          { name: resource.name, stage: 'dev' },
          this.region,
          this.accountId!
        );
        // Set the API ID from state
        (api as any).apiId = resource.metadata?.apiId;
        
        // Recreate functions from state
        const functionResources = state.resources.filter(
          r => r.type === 'function' && r.metadata?.apiName === resource.name
        );
        for (const fnResource of functionResources) {
          const fn = new NimbusFunction(
            { name: fnResource.name, handler: '' },
            this.region,
            this.accountId!
          );
          (api as any).functions.set(fnResource.name, fn);
        }

        await api.destroy();
        await this.stateManager.removeResource(resource.id);
        
        // Remove API functions from state
        for (const fnResource of functionResources) {
          await this.stateManager.removeResource(fnResource.id);
        }
      }

      // Delete standalone functions
      console.log('\n[LAMBDA] Destroying standalone functions...');
      for (const resource of state.resources.filter(
        r => r.type === 'function' && !r.metadata?.apiName
      )) {
        const func = new NimbusFunction(
          { name: resource.name, handler: '' },
          this.region,
          this.accountId!
        );
        await func.destroy();
        await this.stateManager.removeResource(resource.id);
      }

      // Delete KV stores
      const kvCount = state.resources.filter(r => r.type === 'kv').length;
      if (force && kvCount > 0) {
        console.log('\n[KV] Destroying KV stores...');
        for (const resource of state.resources.filter(r => r.type === 'kv')) {
          const nosql = new NoSQL(
            { name: resource.name },
            this.region,
            this.accountId!
          );
          await nosql.destroy();
          await this.stateManager.removeResource(resource.id);
        }
      }
      if (!force && kvCount > 0) {
        console.log(`\n[KV] Skipping ${kvCount} KV store(s) (use --force to delete)`);
      }

      // Delete SQL databases
      const sqlCount = state.resources.filter(r => r.type === 'sql').length;
      if (force && sqlCount > 0) {
        console.log('\n[SQL] Destroying SQL databases...');
        for (const resource of state.resources.filter(r => r.type === 'sql')) {
          const sql = new SQL(
            { name: resource.name },
            this.region,
            this.accountId!
          );
          await sql.destroy();
          await this.stateManager.removeResource(resource.id);
        }
      }
      if (!force && sqlCount > 0) {
        console.log(`\n[SQL] Skipping ${sqlCount} SQL database(s) (use --force to delete)`);
      }

      // Delete Storage buckets
      const storageCount = state.resources.filter(r => r.type === 'storage').length;
      if (force && storageCount > 0) {
        console.log('\n[STORAGE] Destroying Storage buckets...');
        for (const resource of state.resources.filter(r => r.type === 'storage')) {
          const storage = new Storage(
            { name: resource.name },
            this.region,
            this.accountId!
          );
          // Override the bucket name with the full name from state
          (storage as any).name = resource.metadata?.bucketName || resource.name;
          await storage.destroy();
          await this.stateManager.removeResource(resource.id);
        }
      } else if (storageCount > 0) {
        console.log(`\n[STORAGE] Skipping ${storageCount} Storage bucket(s) (use --force to delete)`);
      }

      // Delete Queues
      const queueCount = state.resources.filter(r => r.type === 'queue').length;
      if (force && queueCount > 0) {
        console.log('\n[QUEUE] Destroying Queues...');
        for (const resource of state.resources.filter(r => r.type === 'queue')) {
          const queue = new Queue(
            { name: resource.name },
            this.region,
            this.accountId!
          );
          (queue as any).queueUrl = resource.metadata?.queueUrl;
          (queue as any).queueArn = resource.arn;
          await queue.destroy();
          await this.stateManager.removeResource(resource.id);
          
          // Also delete worker function if it exists
          const workerFunc = state.resources.find(
            r => r.type === 'function' && r.metadata?.queueName === resource.name
          );
          if (workerFunc) {
            await this.stateManager.removeResource(workerFunc.id);
          }
        }
      } else if (queueCount > 0) {
        console.log(`\n[QUEUE] Skipping ${queueCount} Queue(s) (use --force to delete)`);
      }

      // Delete Timers
      const timerCount = state.resources.filter(r => r.type === 'timer').length;
      if (timerCount > 0) {
        console.log('\n[TIMER] Destroying Timers...');
      }
      for (const resource of state.resources.filter(r => r.type === 'timer')) {
        const timer = new Timer(
          { name: resource.name, schedule: resource.metadata?.schedule || 'rate(1 hour)' },
          this.region,
          this.accountId!
        );
        (timer as any).ruleArn = resource.arn;
        await timer.destroy();
        await this.stateManager.removeResource(resource.id);
        
        // Also delete worker function if it exists
        const workerFunc = state.resources.find(
          r => r.type === 'function' && r.metadata?.timerName === resource.name
        );
        if (workerFunc) {
          await this.stateManager.removeResource(workerFunc.id);
        }
      }

      // Delete Secrets
      const secretCount = state.resources.filter(r => r.type === 'secret').length;
      if (secretCount > 0) {
        console.log('\n[SECRET] Destroying Secrets...');
        for (const resource of state.resources.filter(r => r.type === 'secret')) {
          const secret = new Secret(
            { name: resource.name },
            this.region,
            this.accountId!
          );
          await secret.destroy();
          await this.stateManager.removeResource(resource.id);
        }
      }

      // Delete Parameters
      const parameterCount = state.resources.filter(r => r.type === 'parameter').length;
      if (parameterCount > 0) {
        console.log('\n[PARAMETER] Destroying Parameters...');
        for (const resource of state.resources.filter(r => r.type === 'parameter')) {
          const parameter = new Parameter(
            { name: resource.name },
            this.region,
            this.accountId!
          );
          await parameter.destroy();
          await this.stateManager.removeResource(resource.id);
        }
      }

      // Delete roles
      const roleCount = state.resources.filter(r => r.type === 'role').length;
      if (roleCount > 0) {
        console.log('\n[IAM] Destroying IAM roles...');
      }
      for (const resource of state.resources.filter(r => r.type === 'role')) {
        const role = new Role(resource.name, this.region, this.accountId!);
        await role.destroy();
        await this.stateManager.removeResource(resource.id);
      }

      console.log('\n[SUCCESS] Destroy complete!\n');
      
      if (!force) {
        console.log('Note: Data resources were preserved. Use --force to delete them.\n');
      }
    } finally {
      await this.stateManager.releaseLock();
    }
  }
}

// Factory functions for cleaner API
function createFunction(options: FunctionOptions): NimbusFunction {
  return new NimbusFunction(options, 'us-east-1', '');
}

function createAPI(options: APIOptions): API {
  return new API(options, 'us-east-1', '');
}

// Exports
export {
  API,
  NimbusFunction as Function,
  Role,
  NoSQL,
  NoSQL as KV, // Backward compatibility alias
  SQL,
  Storage,
  Queue,
  Timer,
  Secret,
  Parameter,
  runtime,
  HttpMethod,
  LambdaHandler,
  APIOptions,
  FunctionOptions,
  NoSQLOptions,
  KVOptions,
  SQLOptions,
  StorageOptions,
  QueueOptions,
  TimerOptions,
  NimbusOptions,
  DeploymentResult,
  createFunction,
  createAPI,
};

export default Nimbus;
