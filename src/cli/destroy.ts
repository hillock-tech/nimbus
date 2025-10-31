import { colors, icons, logHeader, logError, logSuccess, logWarning, createSpinner } from './utils.js';

function getArg(args: string[], flag: string): string | null {
  const index = args.indexOf(flag);
  if (index === -1 || index === args.length - 1) {
    return null;
  }
  return args[index + 1];
}

export async function destroyCommand(args: string[]) {
  // Parse arguments
  const projectName = getArg(args, '--project');
  const region = getArg(args, '--region');
  const stage = getArg(args, '--stage');
  const force = args.includes('--force');

  // For destroy, use state file with project and region
  if (!projectName || !region) {
    logError('--project and --region are required for destroy');
    console.log('');
    console.log(colors.bold('Usage:'));
    console.log(`  ${colors.primary('nimbus destroy')} ${colors.muted('--project <name> --region <region> [options]')}`);
    console.log('');
    console.log(colors.bold('Options:'));
    console.log(`  ${colors.primary('--project')} ${colors.muted('<name>')}   Project name (required)`);
    console.log(`  ${colors.primary('--region')} ${colors.muted('<region>')} AWS region (required)`);
    console.log(`  ${colors.primary('--stage')} ${colors.muted('<name>')}    Deployment stage (default: dev)`);
    console.log(`  ${colors.primary('--force')}              Force delete data resources`);
    console.log('');
    console.log(colors.bold('Example:'));
    console.log(`  ${colors.muted('$')} nimbus destroy --project my-app --region us-east-1 --stage prod --force`);
    process.exit(1);
  }

  const { default: Nimbus } = await import('../index.js');
  const app = new Nimbus({
    projectName,
    region,
    stage: stage || 'dev',
  });

  logHeader('Nimbus Destroy', icons.fire);
  console.log(`${colors.muted('Project:')} ${colors.bold(projectName)}`);
  console.log(`${colors.muted('Region:')} ${colors.bold(region)}`);
  console.log(`${colors.muted('Stage:')} ${colors.bold(stage || 'dev')}`);
  if (force) {
    logWarning('Force mode enabled - will delete data resources');
  }

  try {
    await app.destroy({ force });
  } catch (error: any) {
    logError('Destroy failed', error.message);
    if (error.stack) {
      console.log(colors.dim(error.stack));
    }
    process.exit(1);
  }
}