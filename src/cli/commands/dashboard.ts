import { Command } from 'commander';
import chalk from 'chalk';
import { loadConfig } from '../../services/config.js';
import { startDashboard } from '../../dashboard/server.js';

export const dashboardCommand = new Command('dashboard')
  .description('Start the web dashboard')
  .option('-p, --port <number>', 'Port to run dashboard on', '3333')
  .action(async (options) => {
    try {
      // Verify config exists
      loadConfig();
    } catch (error) {
      console.error(chalk.red('Configuration not found. Run "cursor-rag setup" first.'));
      process.exit(1);
    }

    const port = parseInt(options.port, 10);
    
    console.log(chalk.bold('\n📊 Starting Cursor RAG Dashboard\n'));
    console.log(`   ${chalk.cyan(`http://localhost:${port}`)}\n`);
    console.log(chalk.gray('Press Ctrl+C to stop\n'));

    startDashboard(port);
  });
