#!/usr/bin/env node
import { Command } from 'commander';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { setupCommand } from './commands/setup.js';
import { ingestCommand } from './commands/ingest.js';
import { searchCommand } from './commands/search.js';
import { statusCommand } from './commands/status.js';
import { dashboardCommand } from './commands/dashboard.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read version from package.json
let version = '0.2.0-alpha.1';
try {
  const pkgPath = join(__dirname, '../../package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
  version = pkg.version;
} catch {
  // Fallback to hardcoded version
}

const program = new Command();

program
  .name('cursor-rag')
  .description('Recursive RAG for Cursor IDE')
  .version(version);

program.addCommand(setupCommand);
program.addCommand(ingestCommand);
program.addCommand(searchCommand);
program.addCommand(statusCommand);
program.addCommand(dashboardCommand);

program.parse();
