#!/usr/bin/env node

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Use createRequire to load the compiled CLI
const require = createRequire(import.meta.url);
const cliPath = join(__dirname, '../dist/cli/index.js');

// Import and run the CLI
import(cliPath).catch((error) => {
  console.error('Failed to start CLI:', error);
  process.exit(1);
});
