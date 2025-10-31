import {
  DSQLClient,
  CreateClusterCommand,
  DeleteClusterCommand,
  GetClusterCommand,
  ListClustersCommand,
} from '@aws-sdk/client-dsql';
import { SQLOptions, PolicyStatement, IResource } from './types-v2';

/**
 * Nimbus.SQL - Serverless SQL database backed by Aurora DSQL
 */
export class SQL implements IResource {
  private name: string;
  private schema: string;
  private region: string;
  private accountId: string;
  private dsqlClient: DSQLClient;
  private clusterArn?: string;
  private identifier?: string;
  private deletionProtection: boolean;
  private lambdaRoleArn?: string;
  private dbRoleName?: string;

  constructor(
    options: SQLOptions,
    region: string,
    accountId: string
  ) {
    this.name = options.name;
    this.schema = options.schema || options.name;
    this.region = region;
    this.accountId = accountId;
    this.deletionProtection = options.deletionProtection || false;
    this.dsqlClient = new DSQLClient({ region });
    // Set db role name immediately (needed for env var injection)
    this.dbRoleName = `lambda_${this.schema}`;
  }

  /**
   * Get SQL database name
   */
  getName(): string {
    return this.name;
  }

  /**
   * Get the cluster ARN
   */
  getArn(): string {
    if (!this.clusterArn) {
      // Return expected ARN pattern
      return `arn:aws:dsql:${this.region}:${this.accountId}:cluster/*`;
    }
    return this.clusterArn;
  }

  /**
   * Get cluster identifier
   */
  getIdentifier(): string {
    if (!this.identifier) {
      throw new Error('SQL cluster has not been provisioned yet');
    }
    return this.identifier;
  }

  /**
   * Get cluster endpoint (constructed from identifier)
   */
  getEndpoint(): string {
    if (!this.identifier) {
      throw new Error('SQL cluster has not been provisioned yet');
    }
    return `${this.identifier}.dsql.${this.region}.on.aws`;
  }

  /**
   * Get environment variable reference for cluster identifier
   */
  getIdentifierRef(): { name: string; value: string } {
    return {
      name: `SQL_${this.name.toUpperCase().replace(/-/g, '_')}_IDENTIFIER`,
      value: this.identifier || '',
    };
  }

  /**
   * Get environment variable reference for cluster endpoint
   */
  getEndpointRef(): { name: string; value: string } {
    return {
      name: `SQL_${this.name.toUpperCase().replace(/-/g, '_')}_ENDPOINT`,
      value: this.identifier ? this.getEndpoint() : '',
    };
  }

  /**
   * Get environment variable reference for cluster ARN
   */
  getArnRef(): { name: string; value: string } {
    return {
      name: `SQL_${this.name.toUpperCase().replace(/-/g, '_')}_ARN`,
      value: this.clusterArn || '',
    };
  }

  /**
   * Get environment variable reference for schema name
   */
  getSchemaRef(): { name: string; value: string } {
    return {
      name: `SQL_${this.name.toUpperCase().replace(/-/g, '_')}_SCHEMA`,
      value: this.schema,
    };
  }

  /**
   * Get environment variable reference for database role name
   */
  getDbRoleRef(): { name: string; value: string } {
    return {
      name: `SQL_${this.name.toUpperCase().replace(/-/g, '_')}_DB_ROLE`,
      value: this.dbRoleName || '',
    };
  }

  /**
   * Set up database schema and role for Lambda
   */
  async setupSchema(lambdaRoleArn: string): Promise<void> {
    this.lambdaRoleArn = lambdaRoleArn;
    // dbRoleName is already set in constructor
    
    // Connect as admin and set up schema + role
    await this.initializeDatabase();
  }

  /**
   * Get required IAM policy statements
   */
  getPolicyStatements(): PolicyStatement[] {
    return [
      {
        Effect: 'Allow',
        Action: [
          'dsql:DbConnect', // Lambda connects as non-admin user
        ],
        Resource: this.getArn(),
      },
    ];
  }

  /**
   * Provision the Aurora DSQL cluster
   */
  async provision(): Promise<void> {
    // Check if cluster already exists by listing and finding by tags
    const existingCluster = await this.findExistingCluster();
    
    if (existingCluster) {
      // Use existing cluster
      this.identifier = existingCluster.identifier;
      this.clusterArn = existingCluster.arn;
      console.log(`    SUCCESS Using existing DSQL cluster: ${this.identifier}`);
    } else {
      // Create new cluster
      await this.createCluster();
    }
  }

  /**
   * Find existing DSQL cluster by tags
   */
  private async findExistingCluster(): Promise<{ identifier: string; arn: string } | null> {
    try {
      const listCommand = new ListClustersCommand({});
      const response = await this.dsqlClient.send(listCommand);
      
      if (!response.clusters) {
        return null;
      }

      // Check each cluster for matching tags
      for (const cluster of response.clusters) {
        if (cluster.identifier) {
          const getCommand = new GetClusterCommand({ identifier: cluster.identifier });
          const clusterDetails = await this.dsqlClient.send(getCommand);
          
          if (
            clusterDetails.tags?.Name === this.name &&
            clusterDetails.tags?.ManagedBy === 'Nimbus'
          ) {
            return {
              identifier: cluster.identifier,
              arn: cluster.arn!,
            };
          }
        }
      }
      
      return null;
    } catch (error) {
      console.error('Error finding existing cluster:', error);
      return null;
    }
  }

  /**
   * Create Aurora DSQL cluster
   */
  private async createCluster(): Promise<void> {
    const createCommand = new CreateClusterCommand({
      deletionProtectionEnabled: this.deletionProtection,
      tags: {
        Name: this.name,
        ManagedBy: 'Nimbus',
      },
    });

    const response = await this.dsqlClient.send(createCommand);
    this.clusterArn = response.arn;
    this.identifier = response.identifier;

    // Wait for cluster to be available
    await this.waitForCluster();
  }

  /**
   * Wait for cluster to become available
   */
  private async waitForCluster(): Promise<void> {
    let attempts = 0;
    const maxAttempts = 60; // DSQL can take longer to provision

    while (attempts < maxAttempts) {
      try {
        const getCommand = new GetClusterCommand({ 
          identifier: this.identifier! 
        });
        const response = await this.dsqlClient.send(getCommand);

        if (response.status === 'ACTIVE') {
          return;
        }
      } catch (error) {
        // Continue waiting
      }

      await new Promise(resolve => setTimeout(resolve, 5000)); // Check every 5 seconds
      attempts++;
    }

    throw new Error(`Cluster ${this.identifier} did not become active within timeout`);
  }

  /**
   * Initialize database with schema and role for Lambda
   * Connects as admin using current IAM credentials
   */
  private async initializeDatabase(): Promise<void> {
    const { Client } = require('pg');
    const { DsqlSigner } = require('@aws-sdk/dsql-signer');
    
    console.log(`  📋 Setting up schema "${this.schema}" and database role...`);
    
    try {
      // Generate admin auth token using current IAM credentials
      const signer = new DsqlSigner({
        hostname: this.getEndpoint(),
        region: this.region,
      });
      const token = await signer.getDbConnectAdminAuthToken();
      
      // Connect as admin
      const client = new Client({
        host: this.getEndpoint(),
        port: 5432,
        user: 'admin',
        password: token,
        database: 'postgres',
        ssl: { rejectUnauthorized: true },
      });
      
      await client.connect();
      
      // Create schema if it doesn't exist
      await client.query(`CREATE SCHEMA IF NOT EXISTS ${this.schema}`);
      console.log(`    SUCCESS Schema "${this.schema}" ready`);
      
      // Create database role for Lambda if it doesn't exist
      await client.query(`CREATE ROLE ${this.dbRoleName} WITH LOGIN`);
      console.log(`    SUCCESS Database role "${this.dbRoleName}" created`);
      
      // Map IAM role to database role
      await client.query(
        `AWS IAM GRANT ${this.dbRoleName} TO '${this.lambdaRoleArn}'`
      );
      console.log(`    SUCCESS IAM role mapped to database role`);
      
      // Grant permissions on schema
      await client.query(`GRANT USAGE ON SCHEMA ${this.schema} TO ${this.dbRoleName}`);
      await client.query(`GRANT CREATE ON SCHEMA ${this.schema} TO ${this.dbRoleName}`);
      await client.query(`GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA ${this.schema} TO ${this.dbRoleName}`);
      await client.query(`GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA ${this.schema} TO ${this.dbRoleName}`);
      
      console.log(`    SUCCESS Permissions granted on schema "${this.schema}"`);
      
      await client.end();
    } catch (error: any) {
      // If role already exists, that's okay - just update the grants
      if (error.message && error.message.includes('already exists')) {
        console.log(`    INFO  Database role already exists, updating permissions...`);
        
        const signer = new DsqlSigner({
          hostname: this.getEndpoint(),
          region: this.region,
        });
        const token = await signer.getDbConnectAdminAuthToken();
        
        const client = new Client({
          host: this.getEndpoint(),
          port: 5432,
          user: 'admin',
          password: token,
          database: 'postgres',
          ssl: { rejectUnauthorized: true },
        });
        
        await client.connect();
        
        // Ensure IAM mapping and permissions are up to date
        try {
          await client.query(`AWS IAM GRANT ${this.dbRoleName} TO '${this.lambdaRoleArn}'`);
        } catch (e) {
          // Already mapped
        }
        
        await client.query(`GRANT USAGE ON SCHEMA ${this.schema} TO ${this.dbRoleName}`);
        await client.query(`GRANT CREATE ON SCHEMA ${this.schema} TO ${this.dbRoleName}`);
        
        // Try to grant privileges on existing tables (may fail if tables are owned by the lambda role)
        try {
          await client.query(`GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA ${this.schema} TO ${this.dbRoleName}`);
          await client.query(`GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA ${this.schema} TO ${this.dbRoleName}`);
        } catch (e) {
          // Tables may be owned by the lambda role itself, which is fine - it already has full access
        }
        
        await client.end();
        console.log(`    SUCCESS Permissions updated`);
      } else {
        throw error;
      }
    }
  }

  /**
   * Destroy the Aurora DSQL cluster
   */
  async destroy(): Promise<void> {
    if (!this.identifier) {
      return;
    }

    try {
      const command = new DeleteClusterCommand({ 
        identifier: this.identifier 
      });
      await this.dsqlClient.send(command);
      console.log(`  SUCCESS Deleted SQL cluster: ${this.name}`);
    } catch (error: any) {
      if (error.name === 'ResourceNotFoundException') {
        // Cluster already deleted
        return;
      }
      throw error;
    }
  }
}

