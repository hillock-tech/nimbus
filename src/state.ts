/**
 * State management for tracking deployed resources
 */


import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { StateManager as S3StateManager } from './state-manager';

export interface ResourceState {
  id: string;
  type: 'api' | 'function' | 'role' | 'kv' | 'sql' | 'storage' | 'queue' | 'timer' | 'secret' | 'parameter';
  name: string;
  arn?: string;
  region: string;
  createdAt: string;
  metadata?: Record<string, any>;
}

export interface DeploymentState {
  stage: string;
  region: string;
  accountId: string;
  resources: ResourceState[];
  lastDeployed: string;
}

export interface NimbusState {
  version: string;
  projectName: string;
  deployments: Record<string, DeploymentState>; // key: "stage-region"
}

export class StateManager {
  private state: NimbusState | null = null;
  private s3Manager: S3StateManager;
  private currentDeploymentKey: string;
  private stage: string;
  private region: string;

  constructor(projectName: string, stage: string = 'dev', region: string = 'us-east-1') {
    this.stage = stage;
    this.region = region;
    this.currentDeploymentKey = `${stage}-${region}`;
    
    // Check for .nimbusrc config in home directory only
    const configPath = path.resolve(os.homedir(), '.nimbusrc');
    
    if (!fs.existsSync(configPath)) {
      throw new Error(
        'Nimbus requires S3 state storage. Please run "npx nimbus init" to configure S3 state backend.\n' +
        `This creates a .nimbusrc file in your home directory (${os.homedir()}).`
      );
    }

    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    if (!config.bucket || !config.region) {
      throw new Error(
        `Invalid .nimbusrc configuration. Missing bucket or region.\n` +
        `Config file: ${configPath}\n` +
        'Please run "npx nimbus init" to reconfigure S3 state backend.'
      );
    }

    this.s3Manager = new S3StateManager(config.bucket, `${projectName}.state.json`, `${projectName}.lock`, config.region);
  }

  async acquireLock() {
    return this.s3Manager.acquireLock();
  }

  async releaseLock() {
    return this.s3Manager.releaseLock();
  }

  async readState(): Promise<DeploymentState | null> {
    const fullState = await this.readFullState();
    if (!fullState || !fullState.deployments) return null;
    return fullState.deployments[this.currentDeploymentKey] || null;
  }

  async readFullState(): Promise<NimbusState | null> {
    const data = await this.s3Manager.readState();
    if (!data) return null;
    
    // Migrate old state format to new format
    if (data.resources && !data.deployments) {
      return this.migrateOldState(data);
    }
    return data;
  }

  async writeState(state: NimbusState): Promise<void> {
    if (!this.s3Manager) {
      throw new Error('S3 state manager not initialized');
    }
    
    await this.s3Manager.writeState(state);
    this.state = state;
  }

  /**
   * Migrate old state format to new multi-deployment format
   */
  private migrateOldState(oldState: any): NimbusState {
    const deploymentKey = `dev-${oldState.region}`;
    return {
      version: oldState.version || '1.0.0',
      projectName: oldState.projectName,
      deployments: {
        [deploymentKey]: {
          stage: 'dev',
          region: oldState.region,
          accountId: oldState.accountId,
          resources: oldState.resources || [],
          lastDeployed: oldState.lastDeployed,
        }
      }
    };
  }

  /**
   * Load state (synchronous wrapper - deprecated)
   */
  load(): DeploymentState | null {
    // This method is kept for backward compatibility but should not be used
    // All state operations should be async and use readState()
    throw new Error('load() is deprecated. Use async readState() instead.');
  }

  /**
   * Load full state from S3 (synchronous wrapper)
   */
  loadFullState(): NimbusState | null {
    // This method is kept for backward compatibility but should not be used
    // All state operations should be async and use readFullState()
    throw new Error('loadFullState() is deprecated. Use async readFullState() instead.');
  }

  /**
   * Save state to S3 (synchronous wrapper)
   */
  save(state: NimbusState): void {
    // This method is kept for backward compatibility but should not be used
    // All state operations should be async and use writeState()
    throw new Error('save() is deprecated. Use async writeState() instead.');
  }

  /**
   * Add a resource to state
   */
  async addResource(resource: ResourceState): Promise<void> {
    if (!this.state) {
      throw new Error('State not initialized. Call initialize() first.');
    }

    // Ensure current deployment exists
    if (!this.state.deployments[this.currentDeploymentKey]) {
      this.state.deployments[this.currentDeploymentKey] = {
        stage: this.stage,
        region: this.region,
        accountId: resource.region === this.region ? '' : resource.region, // Will be set properly during deployment
        resources: [],
        lastDeployed: new Date().toISOString(),
      };
    }

    const deployment = this.state.deployments[this.currentDeploymentKey];
    
    // Remove existing resource with same ID
    deployment.resources = deployment.resources.filter(r => r.id !== resource.id);
    
    // Add new resource
    deployment.resources.push(resource);
    deployment.lastDeployed = new Date().toISOString();
    
    await this.writeState(this.state);
  }

  /**
   * Remove a resource from state
   */
  async removeResource(id: string): Promise<void> {
    if (!this.state || !this.state.deployments[this.currentDeploymentKey]) return;

    const deployment = this.state.deployments[this.currentDeploymentKey];
    deployment.resources = deployment.resources.filter(r => r.id !== id);
    await this.writeState(this.state);
  }

  /**
   * Get all resources for current deployment
   */
  getResources(): ResourceState[] {
    if (!this.state || !this.state.deployments[this.currentDeploymentKey]) {
      return [];
    }
    return this.state.deployments[this.currentDeploymentKey].resources;
  }

  /**
   * Get resources by type for current deployment
   */
  getResourcesByType(type: ResourceState['type']): ResourceState[] {
    return this.getResources().filter(r => r.type === type);
  }

  /**
   * Clear all state from S3
   */
  async clear(): Promise<void> {
    if (!this.s3Manager) {
      throw new Error('S3 state manager not initialized');
    }
    
    // Delete the state file from S3
    try {
      await this.s3Manager.writeState({} as any); // This will effectively clear the state
    } catch (error) {
      // Ignore errors if state doesn't exist
    }
    this.state = null;
  }

  /**
   * Clear current deployment only
   */
  clearDeployment(): void {
    if (this.state && this.state.deployments[this.currentDeploymentKey]) {
      delete this.state.deployments[this.currentDeploymentKey];
      this.save(this.state);
    }
  }

  /**
   * Initialize new state
   */
  async initialize(projectName: string, region: string, accountId: string): Promise<NimbusState> {
    // Load existing state or create new
    const existingState = await this.readFullState();
    
    if (existingState) {
      this.state = existingState;
    } else {
      this.state = {
        version: '1.0.0',
        projectName,
        deployments: {},
      };
    }

    // Ensure deployments object exists
    if (!this.state.deployments) {
      this.state.deployments = {};
    }

    // Initialize current deployment
    this.state.deployments[this.currentDeploymentKey] = {
      stage: this.stage,
      region,
      accountId,
      resources: [],
      lastDeployed: new Date().toISOString(),
    };

    return this.state;
  }

  /**
   * Get current deployment state
   */
  getCurrentDeployment(): DeploymentState | null {
    if (!this.state || !this.state.deployments[this.currentDeploymentKey]) {
      return null;
    }
    return this.state.deployments[this.currentDeploymentKey];
  }

  /**
   * Get all deployments
   */
  getAllDeployments(): Record<string, DeploymentState> {
    return this.state?.deployments || {};
  }

  /**
   * Get current state
   */
  getState(): NimbusState | null {
    return this.state;
  }

  /**
   * Get current deployment key
   */
  getCurrentDeploymentKey(): string {
    return this.currentDeploymentKey;
  }

  /**
   * List all deployment keys
   */
  listDeployments(): string[] {
    if (!this.state) return [];
    return Object.keys(this.state.deployments);
  }
}
