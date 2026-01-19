/**
 * Rules Optimizer CLI Commands
 * 
 * Commands for analyzing and optimizing Cursor rules and AGENTS.md files.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { resolve, relative, basename } from 'path';
import { existsSync, mkdirSync, writeFileSync, copyFileSync } from 'fs';

import { getRulesParser, parseRulesDirectory } from '../../services/rulesParser.js';
import { getRulesAnalyzer } from '../../services/rulesAnalyzer.js';
import { loadConfig } from '../../services/config.js';
import type { OptimizationReport, ParsedRule, DuplicateMatch, RuleConflict, OutdatedRule } from '../../types/rulesOptimizer.js';

const rulesCommand = new Command('rules')
  .description('Analyze and optimize Cursor rules and AGENTS.md files');

rulesCommand
  .command('analyze <folder>')
  .description('Analyze rules without making changes')
  .option('--json', 'Output as JSON')
  .option('--no-llm', 'Disable LLM analysis')
  .option('--threshold <number>', 'Similarity threshold for duplicates (0-1)', '0.7')
  .action(async (folder: string, options) => {
    const folderPath = resolve(folder);
    
    if (!existsSync(folderPath)) {
      console.error(chalk.red(`Folder not found: ${folderPath}`));
      process.exit(1);
    }

    const spinner = ora('Parsing rules...').start();

    try {
      const config = await loadConfig();
      const parser = getRulesParser();
      const rules = parser.parseDirectory(folderPath);

      spinner.text = `Found ${rules.length} rules, analyzing...`;

      const analyzer = getRulesAnalyzer(config, {
        useLLM: options.llm !== false,
        duplicateThreshold: parseFloat(options.threshold),
        dryRun: true,
      });

      const report = await analyzer.analyzeRules(rules, folderPath);

      spinner.succeed(`Analysis complete`);

      if (options.json) {
        console.log(JSON.stringify(report, null, 2));
        return;
      }

      printAnalysisReport(report, folderPath);

    } catch (error) {
      spinner.fail('Analysis failed');
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`));
      process.exit(1);
    }
  });

rulesCommand
  .command('duplicates <folder>')
  .description('Show duplicate rules only')
  .option('--threshold <number>', 'Similarity threshold (0-1)', '0.7')
  .option('--json', 'Output as JSON')
  .action(async (folder: string, options) => {
    const folderPath = resolve(folder);
    
    if (!existsSync(folderPath)) {
      console.error(chalk.red(`Folder not found: ${folderPath}`));
      process.exit(1);
    }

    const spinner = ora('Finding duplicates...').start();

    try {
      const config = await loadConfig();
      const rules = parseRulesDirectory(folderPath);

      spinner.text = `Found ${rules.length} rules, checking for duplicates...`;

      const analyzer = getRulesAnalyzer(config, {
        useLLM: false,
        duplicateThreshold: parseFloat(options.threshold),
      });

      const report = await analyzer.analyzeRules(rules, folderPath);
      const duplicates = report.findings.duplicates;

      spinner.succeed(`Found ${duplicates.length} duplicate pairs`);

      if (options.json) {
        console.log(JSON.stringify(duplicates, null, 2));
        return;
      }

      if (duplicates.length === 0) {
        console.log(chalk.green('\n✓ No duplicates found!\n'));
        return;
      }

      printDuplicates(duplicates, folderPath);

    } catch (error) {
      spinner.fail('Duplicate detection failed');
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`));
      process.exit(1);
    }
  });

rulesCommand
  .command('conflicts <folder>')
  .description('Show conflicting rules')
  .option('--json', 'Output as JSON')
  .action(async (folder: string, options) => {
    const folderPath = resolve(folder);
    
    if (!existsSync(folderPath)) {
      console.error(chalk.red(`Folder not found: ${folderPath}`));
      process.exit(1);
    }

    const spinner = ora('Finding conflicts...').start();

    try {
      const config = await loadConfig();
      const rules = parseRulesDirectory(folderPath);

      const analyzer = getRulesAnalyzer(config, {
        useLLM: false,
        detectConflicts: true,
      });

      const report = await analyzer.analyzeRules(rules, folderPath);
      const conflicts = report.findings.conflicts;

      spinner.succeed(`Found ${conflicts.length} conflicts`);

      if (options.json) {
        console.log(JSON.stringify(conflicts, null, 2));
        return;
      }

      if (conflicts.length === 0) {
        console.log(chalk.green('\n✓ No conflicts found!\n'));
        return;
      }

      printConflicts(conflicts, folderPath);

    } catch (error) {
      spinner.fail('Conflict detection failed');
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`));
      process.exit(1);
    }
  });

rulesCommand
  .command('outdated <folder>')
  .description('Show outdated rules')
  .option('--json', 'Output as JSON')
  .action(async (folder: string, options) => {
    const folderPath = resolve(folder);
    
    if (!existsSync(folderPath)) {
      console.error(chalk.red(`Folder not found: ${folderPath}`));
      process.exit(1);
    }

    const spinner = ora('Finding outdated rules...').start();

    try {
      const config = await loadConfig();
      const rules = parseRulesDirectory(folderPath);

      const analyzer = getRulesAnalyzer(config, {
        useLLM: false,
        detectOutdated: true,
      });

      const report = await analyzer.analyzeRules(rules, folderPath);
      const outdated = report.findings.outdated;

      spinner.succeed(`Found ${outdated.length} potentially outdated rules`);

      if (options.json) {
        console.log(JSON.stringify(outdated, null, 2));
        return;
      }

      if (outdated.length === 0) {
        console.log(chalk.green('\n✓ No outdated rules found!\n'));
        return;
      }

      printOutdated(outdated, folderPath);

    } catch (error) {
      spinner.fail('Outdated detection failed');
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`));
      process.exit(1);
    }
  });

rulesCommand
  .command('optimize <folder>')
  .description('Optimize rules (dry-run by default)')
  .option('--dry-run', 'Preview changes without applying (default)', true)
  .option('--apply', 'Apply changes (creates backups)')
  .option('--backup <dir>', 'Backup directory', '.cursor-rag/rules-backup')
  .option('--aggressive', 'More aggressive merging')
  .option('--threshold <number>', 'Similarity threshold (0-1)', '0.7')
  .option('--output <dir>', 'Write optimized rules to different location')
  .option('--json', 'Output as JSON')
  .action(async (folder: string, options) => {
    const folderPath = resolve(folder);
    
    if (!existsSync(folderPath)) {
      console.error(chalk.red(`Folder not found: ${folderPath}`));
      process.exit(1);
    }

    const isDryRun = !options.apply;
    const spinner = ora(isDryRun ? 'Analyzing rules (dry-run)...' : 'Optimizing rules...').start();

    try {
      const config = await loadConfig();
      const rules = parseRulesDirectory(folderPath);

      spinner.text = `Found ${rules.length} rules, analyzing...`;

      const analyzer = getRulesAnalyzer(config, {
        useLLM: true,
        duplicateThreshold: parseFloat(options.threshold),
        aggressiveness: options.aggressive ? 'aggressive' : 'balanced',
        dryRun: isDryRun,
        createBackups: !isDryRun,
        backupDir: options.backup,
      });

      const report = await analyzer.analyzeRules(rules, folderPath);

      if (isDryRun) {
        spinner.succeed('Analysis complete (dry-run mode)');
        
        if (options.json) {
          console.log(JSON.stringify(report, null, 2));
          return;
        }

        printOptimizationPlan(report, folderPath);
      } else {
        // Create backups
        const backupDir = resolve(options.backup);
        spinner.text = 'Creating backups...';
        createBackups(rules, backupDir);

        // Apply optimizations
        spinner.text = 'Applying optimizations...';
        const result = applyOptimizations(report, options.output ? resolve(options.output) : folderPath);

        spinner.succeed(`Optimization complete`);

        console.log(chalk.cyan('\n📊 Results:\n'));
        console.log(`  Files modified: ${result.filesModified}`);
        console.log(`  Files deleted: ${result.filesDeleted}`);
        console.log(`  Tokens saved: ${chalk.green(result.tokensSaved.toLocaleString())}`);
        console.log(`  Backup location: ${chalk.gray(backupDir)}`);
        console.log('');
      }

    } catch (error) {
      spinner.fail('Optimization failed');
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`));
      process.exit(1);
    }
  });

rulesCommand
  .command('list <folder>')
  .description('List all rules in a folder')
  .option('--json', 'Output as JSON')
  .option('--sort <field>', 'Sort by: tokens, name, modified', 'name')
  .action(async (folder: string, options) => {
    const folderPath = resolve(folder);
    
    if (!existsSync(folderPath)) {
      console.error(chalk.red(`Folder not found: ${folderPath}`));
      process.exit(1);
    }

    const spinner = ora('Scanning rules...').start();

    try {
      const rules = parseRulesDirectory(folderPath);

      spinner.succeed(`Found ${rules.length} rules`);

      // Sort rules
      const sortedRules = [...rules].sort((a, b) => {
        switch (options.sort) {
          case 'tokens':
            return b.tokenCount - a.tokenCount;
          case 'modified':
            return b.sourceFile.lastModified.getTime() - a.sourceFile.lastModified.getTime();
          case 'name':
          default:
            return a.title.localeCompare(b.title);
        }
      });

      if (options.json) {
        console.log(JSON.stringify(sortedRules.map(r => ({
          id: r.id,
          title: r.title,
          file: relative(folderPath, r.sourceFile.path),
          tokens: r.tokenCount,
          tags: r.tags,
          modified: r.sourceFile.lastModified.toISOString(),
        })), null, 2));
        return;
      }

      const totalTokens = rules.reduce((sum, r) => sum + r.tokenCount, 0);

      console.log(chalk.cyan('\n📋 Rules List\n'));
      console.log(chalk.gray(`  Total: ${rules.length} rules, ${totalTokens.toLocaleString()} tokens\n`));

      for (const rule of sortedRules) {
        const filePath = relative(folderPath, rule.sourceFile.path);
        const tags = rule.tags.length > 0 ? chalk.gray(` [${rule.tags.slice(0, 3).join(', ')}]`) : '';
        console.log(`  ${chalk.bold(rule.title)}${tags}`);
        console.log(`    ${chalk.gray(filePath)} • ${rule.tokenCount} tokens`);
      }

      console.log('');

    } catch (error) {
      spinner.fail('Listing failed');
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`));
      process.exit(1);
    }
  });

function printAnalysisReport(report: OptimizationReport, folderPath: string): void {
  console.log(chalk.cyan('\n📊 Rules Analysis Report\n'));

  // Summary
  console.log(chalk.bold('Summary:'));
  console.log(`  Files scanned: ${report.summary.totalFiles}`);
  console.log(`  Rules found: ${report.summary.totalRules}`);
  console.log(`  Total tokens: ${report.summary.totalTokensBefore.toLocaleString()}`);
  
  if (report.summary.savingsPercent > 0) {
    console.log(`  Potential savings: ${chalk.green(`${report.summary.savingsPercent}%`)} (${(report.summary.totalTokensBefore - report.summary.totalTokensAfter).toLocaleString()} tokens)`);
  }

  // Findings
  console.log(chalk.bold('\nFindings:'));
  console.log(`  Duplicates: ${report.summary.duplicatesFound}`);
  console.log(`  Conflicts: ${report.summary.conflictsFound}`);
  console.log(`  Merge candidates: ${report.summary.mergeCandidates}`);
  console.log(`  Outdated rules: ${report.summary.outdatedRules}`);

  // Top duplicates
  if (report.findings.duplicates.length > 0) {
    console.log(chalk.bold('\nTop Duplicates:'));
    for (const dup of report.findings.duplicates.slice(0, 5)) {
      const similarity = Math.round(dup.similarity * 100);
      console.log(`  ${chalk.yellow(`${similarity}%`)} ${dup.rule1.title} ↔ ${dup.rule2.title}`);
      console.log(`       Type: ${dup.matchType}, Recommendation: ${dup.recommendation}`);
    }
  }

  // Conflicts
  if (report.findings.conflicts.length > 0) {
    console.log(chalk.bold('\nConflicts:'));
    for (const conflict of report.findings.conflicts.slice(0, 3)) {
      console.log(`  ${chalk.red('⚠')} ${conflict.rule1.title} vs ${conflict.rule2.title}`);
      console.log(`     ${conflict.description}`);
    }
  }

  // Outdated
  if (report.findings.outdated.length > 0) {
    console.log(chalk.bold('\nPotentially Outdated:'));
    for (const out of report.findings.outdated.slice(0, 5)) {
      const confidence = Math.round(out.confidence * 100);
      console.log(`  ${chalk.yellow(`${confidence}%`)} ${out.rule.title}`);
      console.log(`     ${chalk.gray(out.reason)}`);
    }
  }

  // Plan summary
  if (report.plan.actions.length > 0) {
    console.log(chalk.bold('\nOptimization Plan:'));
    console.log(`  Actions: ${report.plan.actions.length}`);
    console.log(`  Risk level: ${report.plan.riskLevel}`);
    console.log(`  Requires review: ${report.plan.requiresManualReview ? 'Yes' : 'No'}`);
    console.log(`  Estimated time: ${report.plan.estimatedDuration}`);
  }

  console.log(chalk.gray('\nRun with --json for full report or use `rules optimize` to apply changes.\n'));
}

function printDuplicates(duplicates: DuplicateMatch[], folderPath: string): void {
  console.log(chalk.cyan('\n🔍 Duplicate Rules\n'));

  for (let i = 0; i < duplicates.length; i++) {
    const dup = duplicates[i]!;
    const similarity = Math.round(dup.similarity * 100);
    
    console.log(chalk.bold(`${i + 1}. ${dup.matchType.toUpperCase()} (${similarity}% similar)`));
    console.log(`   Rule 1: ${dup.rule1.title}`);
    console.log(`   File:   ${chalk.gray(relative(folderPath, dup.rule1.sourceFile.path))}`);
    console.log(`   Rule 2: ${dup.rule2.title}`);
    console.log(`   File:   ${chalk.gray(relative(folderPath, dup.rule2.sourceFile.path))}`);
    console.log(`   Overlap: ${dup.overlappingConcepts.join(', ')}`);
    console.log(`   Action: ${chalk.yellow(dup.recommendation)}`);
    console.log('');
  }
}

function printConflicts(conflicts: RuleConflict[], folderPath: string): void {
  console.log(chalk.cyan('\n⚠️  Rule Conflicts\n'));

  for (let i = 0; i < conflicts.length; i++) {
    const conflict = conflicts[i]!;
    
    console.log(chalk.bold(`${i + 1}. ${conflict.conflictType}`));
    console.log(`   ${conflict.rule1.title} vs ${conflict.rule2.title}`);
    console.log(`   ${conflict.description}`);
    
    for (const stmt of conflict.conflictingStatements.slice(0, 2)) {
      console.log(chalk.red(`   - "${stmt.statement1.substring(0, 60)}..."`));
      console.log(chalk.red(`   - "${stmt.statement2.substring(0, 60)}..."`));
    }
    
    if (conflict.resolution) {
      console.log(chalk.green(`   Suggestion: ${conflict.resolution.reasoning}`));
    }
    console.log('');
  }
}

function printOutdated(outdated: OutdatedRule[], folderPath: string): void {
  console.log(chalk.cyan('\n📅 Potentially Outdated Rules\n'));

  for (let i = 0; i < outdated.length; i++) {
    const out = outdated[i]!;
    const confidence = Math.round(out.confidence * 100);
    
    console.log(chalk.bold(`${i + 1}. ${out.rule.title} (${confidence}% confidence)`));
    console.log(`   File: ${chalk.gray(relative(folderPath, out.rule.sourceFile.path))}`);
    console.log(`   Reason: ${out.reason}`);
    console.log(`   Action: ${chalk.yellow(out.action)}`);
    
    for (const ref of out.outdatedReferences.slice(0, 3)) {
      if (ref.suggestedUpdate) {
        console.log(`   - Update "${ref.reference}" → "${ref.suggestedUpdate}"`);
      } else {
        console.log(`   - ${ref.reference}`);
      }
    }
    console.log('');
  }
}

function printOptimizationPlan(report: OptimizationReport, folderPath: string): void {
  console.log(chalk.cyan('\n📋 Optimization Plan (Dry Run)\n'));

  console.log(chalk.bold('Summary:'));
  console.log(`  Current tokens: ${report.summary.totalTokensBefore.toLocaleString()}`);
  console.log(`  After optimization: ${report.summary.totalTokensAfter.toLocaleString()}`);
  console.log(`  Savings: ${chalk.green(`${report.summary.savingsPercent}%`)}`);
  console.log(`  Risk level: ${report.plan.riskLevel}`);
  console.log('');

  if (report.plan.actions.length === 0) {
    console.log(chalk.green('  ✓ No optimizations needed!\n'));
    return;
  }

  console.log(chalk.bold('Planned Actions:'));
  for (const action of report.plan.actions) {
    const autoLabel = action.autoApplyable ? chalk.green('[auto]') : chalk.yellow('[review]');
    const tokenLabel = action.tokenImpact < 0 
      ? chalk.green(`${action.tokenImpact} tokens`) 
      : `+${action.tokenImpact} tokens`;
    
    console.log(`  ${autoLabel} ${action.type.toUpperCase()}: ${action.description}`);
    console.log(`       Files: ${action.affectedFiles.map(f => relative(folderPath, f)).join(', ')}`);
    console.log(`       Impact: ${tokenLabel}`);
    console.log('');
  }

  console.log(chalk.gray('Run with --apply to execute these changes (backups will be created).\n'));
}

function createBackups(rules: ParsedRule[], backupDir: string): void {
  if (!existsSync(backupDir)) {
    mkdirSync(backupDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const versionDir = resolve(backupDir, timestamp);
  mkdirSync(versionDir, { recursive: true });

  const backedUp = new Set<string>();
  for (const rule of rules) {
    if (backedUp.has(rule.sourceFile.path)) continue;
    backedUp.add(rule.sourceFile.path);
    
    const backupPath = resolve(versionDir, basename(rule.sourceFile.path));
    copyFileSync(rule.sourceFile.path, backupPath);
  }
}

function applyOptimizations(report: OptimizationReport, outputDir: string): {
  filesModified: number;
  filesDeleted: number;
  tokensSaved: number;
} {
  let filesModified = 0;
  let filesDeleted = 0;
  const tokensSaved = report.summary.totalTokensBefore - report.summary.totalTokensAfter;

  // For now, just count what would be changed
  // Full implementation would write the merged files
  for (const change of report.fileChanges) {
    if (change.changeType === 'modify') {
      filesModified++;
    } else if (change.changeType === 'delete') {
      filesDeleted++;
    }
  }

  return { filesModified, filesDeleted, tokensSaved };
}

export { rulesCommand };
