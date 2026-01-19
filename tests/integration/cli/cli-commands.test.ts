import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { tmpdir } from 'os';
import { join } from 'path';
import { rmSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { spawn } from 'child_process';

const testId = `test-cli-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const testDir = join(tmpdir(), testId);

function runCommand(args: string[], options: {
  cwd?: string;
  env?: Record<string, string>;
  timeout?: number;
} = {}): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', ['dist/cli/index.js', ...args], {
      cwd: options.cwd || process.cwd(),
      env: { ...process.env, ...options.env },
      timeout: options.timeout || 30000,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (exitCode) => {
      resolve({ stdout, stderr, exitCode });
    });

    proc.on('error', (err) => {
      reject(err);
    });
  });
}

describe('CLI Commands Integration', () => {
  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('Help Output', () => {
    it('should display help when run with --help', async () => {
      const { stdout, exitCode } = await runCommand(['--help']);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('cursor-rag');
      expect(stdout).toContain('Recursive RAG');
    });

    it('should display version when run with --version', async () => {
      const { stdout, exitCode } = await runCommand(['--version']);

      expect(exitCode).toBe(0);
      expect(stdout).toMatch(/\d+\.\d+\.\d+/);
    });

    it('should display search command help', async () => {
      const { stdout, exitCode } = await runCommand(['search', '--help']);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('search');
      expect(stdout).toContain('--top-k');
    });

    it('should display ingest command help', async () => {
      const { stdout, exitCode } = await runCommand(['ingest', '--help']);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('ingest');
      expect(stdout).toContain('--crawl');
    });

    it('should display chat command help', async () => {
      const { stdout, exitCode } = await runCommand(['chat', '--help']);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('chat');
      expect(stdout).toContain('list');
      expect(stdout).toContain('ingest');
      expect(stdout).toContain('stats');
    });

    it('should display status command help', async () => {
      const { stdout, exitCode } = await runCommand(['status', '--help']);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('status');
      expect(stdout).toContain('configuration');
    });

    it('should display maintenance command help', async () => {
      const { stdout, exitCode } = await runCommand(['maintenance', '--help']);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('maintenance');
    });

    it('should display rules command help', async () => {
      const { stdout, exitCode } = await runCommand(['rules', '--help']);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('rules');
    });

    it('should display dashboard command help', async () => {
      const { stdout, exitCode } = await runCommand(['dashboard', '--help']);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('dashboard');
    });
  });

  describe('Command Validation', () => {
    it('should error on unknown command', async () => {
      const { stderr, exitCode } = await runCommand(['unknown-command']);

      expect(exitCode).not.toBe(0);
      expect(stderr).toContain('unknown command');
    });

    it('should error when search is called without query', async () => {
      const { stderr, exitCode } = await runCommand(['search']);

      expect(exitCode).not.toBe(0);
      expect(stderr.toLowerCase()).toMatch(/missing.*argument|required.*query/i);
    });

    it('should error when ingest is called without source', async () => {
      const { stderr, exitCode } = await runCommand(['ingest']);

      expect(exitCode).not.toBe(0);
      expect(stderr.toLowerCase()).toMatch(/missing.*argument|required.*source/i);
    });
  });

  describe('Chat Subcommands', () => {
    it('should display chat list help', async () => {
      const { stdout, exitCode } = await runCommand(['chat', 'list', '--help']);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('--limit');
      expect(stdout).toContain('--since');
      expect(stdout).toContain('--json');
    });

    it('should display chat ingest help', async () => {
      const { stdout, exitCode } = await runCommand(['chat', 'ingest', '--help']);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('--force');
      expect(stdout).toContain('--dry-run');
      expect(stdout).toContain('--extract');
    });

    it('should display chat stats help', async () => {
      const { stdout, exitCode } = await runCommand(['chat', 'stats', '--help']);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('statistics');
    });

    it('should display chat reset help', async () => {
      const { stdout, exitCode } = await runCommand(['chat', 'reset', '--help']);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('--confirm');
    });
  });
});

describe('CLI Commands with Config', () => {
  const configDir = join(testDir, '.cursor-rag');
  const configPath = join(configDir, 'config.json');

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
    mkdirSync(configDir, { recursive: true });

    const config = {
      vectorStore: 'memory',
      embeddings: 'xenova',
    };

    writeFileSync(configPath, JSON.stringify(config, null, 2));
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should create config directory structure', () => {
    expect(existsSync(configDir)).toBe(true);
    expect(existsSync(configPath)).toBe(true);
  });
});

describe('CLI Output Formatting', () => {
  it('should include version in help output', async () => {
    const { stdout: version } = await runCommand(['--version']);
    const { stdout: help } = await runCommand(['--help']);

    expect(help).toContain('cursor-rag');
    expect(version.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('should list all available commands in help', async () => {
    const { stdout } = await runCommand(['--help']);

    const expectedCommands = [
      'setup',
      'ingest',
      'search',
      'status',
      'dashboard',
      'chat',
      'maintenance',
      'rules',
    ];

    for (const cmd of expectedCommands) {
      expect(stdout).toContain(cmd);
    }
  });
});
