import chalk from 'chalk';
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { CallAgent } from './call_agent.js';

async function main(): Promise<void> {
  const rl = readline.createInterface({ input, output });
  try {
    const agent = new CallAgent();
    await agent.run(rl);
  } finally {
    rl.close();
    console.log(chalk.gray('\nVidyaGyan call simulator closed.\n'));
  }
}

main().catch((err: unknown) => {
  console.error(chalk.red('Fatal error:'), err);
  process.exit(1);
});
