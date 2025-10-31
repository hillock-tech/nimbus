import chalk from 'chalk';
import ora from 'ora';

export const colors = {
  primary: chalk.blue,
  success: chalk.green,
  error: chalk.red,
  warning: chalk.yellow,
  info: chalk.cyan,
  muted: chalk.gray,
  bold: chalk.bold,
  dim: chalk.dim,
};

export const icons = {
  rocket: '▶',
  check: '✓',
  cross: '✗',
  warning: '!',
  info: 'i',
  api: '→',
  function: 'λ',
  database: '□',
  storage: '◇',
  queue: '◈',
  timer: '○',
  security: '#',
  key: '*',
  gear: '●',
  clock: '○',
  fire: '×',
  sparkles: '◆',
  package: '■',
  tree: '├',
};

export const symbols = {
  branch: '├──',
  lastBranch: '└──',
  pipe: '│',
  space: '   ',
  arrow: '→',
  bullet: '•',
};

export function createSpinner(text: string) {
  return ora({
    text: colors.muted(text),
    spinner: 'dots',
  });
}

export function logHeader(title: string, icon?: string) {
  const displayIcon = icon || icons.rocket;
  console.log(`\n${displayIcon} ${colors.bold(title)}`);
}

export function logSuccess(message: string, details?: string) {
  const detail = details ? colors.muted(` (${details})`) : '';
  console.log(`${icons.check} ${colors.success(message)}${detail}`);
}

export function logError(message: string, details?: string) {
  const detail = details ? colors.muted(` ${details}`) : '';
  console.log(`${icons.cross} ${colors.error(message)}${detail}`);
}

export function logInfo(message: string, details?: string) {
  const detail = details ? colors.muted(` ${details}`) : '';
  console.log(`${icons.info} ${colors.info(message)}${detail}`);
}

export function logWarning(message: string, details?: string) {
  const detail = details ? colors.muted(` ${details}`) : '';
  console.log(`${icons.warning} ${colors.warning(message)}${detail}`);
}

export function logTree(items: Array<{ name: string; status: string; url?: string; icon?: string }>, title?: string) {
  if (title) {
    console.log(`\n${colors.bold(title)}`);
  }

  items.forEach((item, index) => {
    const isLast = index === items.length - 1;
    const branch = isLast ? symbols.lastBranch : symbols.branch;
    const icon = item.icon || icons.gear;
    const url = item.url ? colors.muted(` ${item.url}`) : '';

    console.log(`${branch} ${icon} ${colors.bold(item.name)} ${item.status}${url}`);
  });
}

export function logSection(title: string, icon?: string) {
  const displayIcon = icon || icons.gear;
  console.log(`\n${displayIcon} ${colors.primary(title)}`);
}

export function logSubItem(message: string, indent: number = 1) {
  const indentation = symbols.space.repeat(indent);
  console.log(`${indentation}${symbols.bullet} ${colors.muted(message)}`);
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

export function logSummary(title: string, items: Array<{ type: string; name: string; url?: string; icon?: string }>) {
  console.log(`\n${colors.bold(title)}`);
  console.log(colors.muted('─'.repeat(title.length + 10)));

  const groupedItems = items.reduce((acc, item) => {
    if (!acc[item.type]) {
      acc[item.type] = [];
    }
    acc[item.type].push(item);
    return acc;
  }, {} as Record<string, typeof items>);

  Object.entries(groupedItems).forEach(([type, typeItems]) => {
    console.log(`\n${colors.primary(type)}:`);
    typeItems.forEach(item => {
      const icon = item.icon || icons.gear;
      const url = item.url ? colors.muted(` ${symbols.arrow} ${item.url}`) : '';
      console.log(`  ${symbols.bullet} ${icon} ${item.name}${url}`);
    });
  });
}