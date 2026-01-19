import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules', 'dist', 'tests/e2e/**'],
    setupFiles: ['tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.d.ts',
        'src/**/index.ts',
        'src/cli/**',
        'src/dashboard/public/**',
      ],
      thresholds: {
        statements: 70,
        branches: 70,
        functions: 70,
        lines: 70,
      },
    },
    testTimeout: 30000,
    hookTimeout: 30000,
    pool: 'forks',
    isolate: true,
    reporters: ['verbose'],
    sequence: {
      shuffle: false,
    },
    teardownTimeout: 5000,
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
});
