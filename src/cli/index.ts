#!/usr/bin/env node

/**
 * Nimbus CLI
 * 
 * Usage:
 *   npx nimbus deploy [file]
 *   npx nimbus destroy --project <name> --region <region> [--force]
 *   npx nimbus init
 */

import { deployCommand } from './deploy.js';
import { destroyCommand } from './destroy.js';
import { colors, icons, logError } from './utils.js';

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || !['deploy', 'destroy', 'init'].includes(command)) {
    console.log(`\n${icons.rocket} ${colors.bold('Nimbus')} ${colors.muted('- Serverless deployment made simple')}\n`);
    
    console.log(colors.bold('USAGE'));
    console.log(`  ${colors.primary('nimbus')} ${colors.success('<command>')} ${colors.muted('[options]')}\n`);
    
    console.log(colors.bold('COMMANDS'));
    console.log(`  ${colors.success('deploy')} ${colors.muted('[file]')}     ${colors.dim('Deploy resources by importing your nimbus instance')}`);
    console.log(`  ${colors.success('destroy')}               ${colors.dim('Destroy deployed resources')}`);
    console.log(`  ${colors.success('init')}                  ${colors.dim('Initialize S3 bucket for state management')}\n`);
    
    console.log(colors.bold('DEPLOY OPTIONS'));
    console.log(`  ${colors.primary('file')}                  ${colors.dim('Path to your nimbus application file (default: index.ts/js)')}`);
    console.log(`  ${colors.primary('--stage')} ${colors.muted('<name>')}        ${colors.dim('Deployment stage/environment (default: dev)')}\n`);
    
    console.log(colors.bold('DESTROY OPTIONS'));
    console.log(`  ${colors.primary('--project')} ${colors.muted('<name>')}      ${colors.dim('Project name (required)')}`);
    console.log(`  ${colors.primary('--region')} ${colors.muted('<region>')}     ${colors.dim('AWS region (required)')}`);
    console.log(`  ${colors.primary('--stage')} ${colors.muted('<name>')}        ${colors.dim('Deployment stage/environment (default: dev)')}`);
    console.log(`  ${colors.primary('--force')}               ${colors.dim('Force delete data resources (KV, SQL, Storage)')}\n`);
    
    console.log(colors.bold('EXAMPLES'));
    console.log(`  ${colors.muted('$')} nimbus deploy ${colors.dim('# auto-detects index.ts or index.js')}`);
    console.log(`  ${colors.muted('$')} nimbus deploy index.ts ${colors.dim('# deploy specific file')}`);
    console.log(`  ${colors.muted('$')} nimbus deploy my-app.js --stage prod ${colors.dim('# deploy to production')}`);
    console.log(`  ${colors.muted('$')} nimbus destroy --project my-app --region us-east-1 --stage prod --force`);
    console.log(`  ${colors.muted('$')} nimbus init ${colors.dim('# initialize configuration')}\n`);
    
    process.exit(1);
  }

  try {
    switch (command) {
      case 'deploy':
        await deployCommand(args);
        break;
      case 'destroy':
        await destroyCommand(args);
        break;
      case 'init':
        const { nimbusInit } = await import('./init.js');
        await nimbusInit();
        break;
    }
  } catch (error: any) {
    logError('Unexpected error', error.message);
    if (error.stack) {
      console.log(colors.dim(error.stack));
    }
    process.exit(1);
  }
}

main();