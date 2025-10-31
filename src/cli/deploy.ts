import path from 'path';
import fs from 'fs';
import { pathToFileURL } from 'url';
import { colors, icons, logHeader, logError, logSuccess, createSpinner } from './utils.js';

export async function deployCommand(args: string[]) {
  // Get file argument (first non-flag argument after 'deploy')
  let appFile: string | undefined = args[1];
  
  // Skip if it's a flag
  if (appFile && appFile.startsWith('--')) {
    appFile = undefined;
  }

  if (!appFile) {
    // Auto-detect index.ts or index.js
    if (fs.existsSync(path.resolve(process.cwd(), 'index.ts'))) {
      appFile = 'index.ts';
    } else if (fs.existsSync(path.resolve(process.cwd(), 'index.js'))) {
      appFile = 'index.js';
    } else {
      logError('No index.ts or index.js found in current directory');
      console.log('');
      console.log(colors.bold('Usage:'));
      console.log(`  ${colors.primary('nimbus deploy')} ${colors.muted('[file]')}`);
      console.log('');
      console.log(colors.bold('Examples:'));
      console.log(`  ${colors.muted('$')} nimbus deploy ${colors.muted('# auto-detects index.ts or index.js')}`);
      console.log(`  ${colors.muted('$')} nimbus deploy my-app.js ${colors.muted('# deploys specific file')}`);
      console.log(`  ${colors.muted('$')} nimbus deploy index.ts ${colors.muted('# deploys TypeScript file')}`);
      process.exit(1);
    }
  }

  const resolvedPath = path.resolve(process.cwd(), appFile);

  if (!fs.existsSync(resolvedPath)) {
    logError(`Application file not found: ${resolvedPath}`);
    console.log('');
    console.log(colors.bold('Usage:'));
    console.log(`  ${colors.primary('nimbus deploy')} ${colors.muted('[file]')}`);
    console.log('');
    console.log(colors.bold('Examples:'));
    console.log(`  ${colors.muted('$')} nimbus deploy ${colors.muted('# auto-detects index.ts or index.js')}`);
    console.log(`  ${colors.muted('$')} nimbus deploy my-app.js ${colors.muted('# deploys specific file')}`);
    console.log(`  ${colors.muted('$')} nimbus deploy index.ts ${colors.muted('# deploys TypeScript file')}`);
    process.exit(1);
  }

  logHeader('Nimbus Deploy', icons.rocket);
  console.log(`${colors.muted('File:')} ${colors.bold(path.basename(resolvedPath))}`);
  console.log(`${colors.muted('Path:')} ${colors.dim(resolvedPath)}`);

  try {
    // Import the file and get the exported nimbus instance
    let nimbusInstance;
    
    // Import the file using dynamic import
    const fileUrl = pathToFileURL(resolvedPath).href;
    
    if (resolvedPath.endsWith('.ts')) {
      // For TypeScript files, create a temporary wrapper file
      const tempWrapper = `
        import * as module from '${fileUrl}';
        
        // Handle potential double default export
        let nimbus = module.default;
        if (nimbus && nimbus.default) {
          nimbus = nimbus.default;
        }
        
        if (!nimbus || typeof nimbus.deploy !== 'function') {
          logError('No valid nimbus instance exported');
          console.log('');
          console.log(colors.bold('Make sure your file exports the nimbus instance:'));
          console.log('  ' + colors.primary('export default') + ' ' + colors.bold('nimbus') + ';');
          process.exit(1);
        }
        
        nimbus.deploy().catch(error => {
          console.error('Error:', error.message);
          if (error.stack) {
            console.error(error.stack);
          }
          process.exit(1);
        });
      `;
      
      const fs = require('fs');
      const tempFile = path.resolve(process.cwd(), '.nimbus-temp-deploy.mjs');
      fs.writeFileSync(tempFile, tempWrapper);
      
      const { spawn } = require('child_process');
      const tsx = spawn('npx', ['tsx', tempFile], {
        stdio: 'inherit',
        shell: true,
      });

      tsx.on('exit', (code: any) => {
        // Clean up temp file
        try {
          fs.unlinkSync(tempFile);
        } catch (e) {
          // Ignore cleanup errors
        }
        process.exit(code || 0);
      });

      tsx.on('error', (error: any) => {
        // Clean up temp file
        try {
          fs.unlinkSync(tempFile);
        } catch (e) {
          // Ignore cleanup errors
        }
        console.error(`Error running TypeScript file: ${error.message}`);
        process.exit(1);
      });
      return;
    }
    
    const module = await import(fileUrl);
    nimbusInstance = module.default;

    if (!nimbusInstance) {
      logError('No default export found in the application file');
      console.log('');
      console.log(colors.bold('Make sure your file exports the nimbus instance:'));
      console.log('  ' + colors.primary('export default') + ' ' + colors.bold('nimbus') + ';');
      process.exit(1);
    }

    if (typeof nimbusInstance.deploy !== 'function') {
      logError('Exported instance does not have a deploy method');
      console.log('');
      console.log(colors.bold('Make sure you export a Nimbus instance:'));
      console.log('  ' + colors.primary('const') + ' ' + colors.bold('nimbus') + ' = ' + colors.primary('new') + ' ' + colors.bold('Nimbus') + '({ ... });');
      console.log('  ' + colors.primary('export default') + ' ' + colors.bold('nimbus') + ';');
      process.exit(1);
    }

    // Call deploy on the imported instance
    await nimbusInstance.deploy();
    
  } catch (error: any) {
    logError('Deployment failed', error.message);
    if (error.stack) {
      console.log(colors.dim(error.stack));
    }
    process.exit(1);
  }
}