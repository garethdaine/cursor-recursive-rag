#!/usr/bin/env node
import { Command } from 'commander';
import { setupCommand } from './commands/setup.js';
import { ingestCommand } from './commands/ingest.js';
import { searchCommand } from './commands/search.js';
import { statusCommand } from './commands/status.js';
import { dashboardCommand } from './commands/dashboard.js';

const program = new Command();

program
  .name('cursor-rag')
  .description('Recursive RAG for Cursor IDE')
  .version('0.1.0');

program.addCommand(setupCommand);
program.addCommand(ingestCommand);
program.addCommand(searchCommand);
program.addCommand(statusCommand);
program.addCommand(dashboardCommand);

program.parse();
