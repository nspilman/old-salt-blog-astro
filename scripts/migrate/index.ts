#!/usr/bin/env node

/**
 * CLI Entry Point for WordPress to Astro Migration
 *
 * This script orchestrates the complete migration process:
 * 1. Fetch all data from WordPress REST API
 * 2. Convert posts and pages to Markdown with frontmatter
 * 3. Write files to disk
 * 4. Generate migration report
 */

import chalk from 'chalk';
import { fetchAllData } from './api.js';
import { writeAllPosts, writeAllPages, writeStats } from './writer.js';
import type { MigrationConfig, MigrationStats } from './types.js';

/**
 * Load migration configuration from environment variables or defaults
 */
function loadConfig(): MigrationConfig {
  const config: MigrationConfig = {
    wpBaseUrl: process.env.WP_BASE_URL || 'https://oldsaltblog.com',
    outputDir: process.env.OUTPUT_DIR || 'src/content',
    delay: parseInt(process.env.DELAY || '100', 10),
    postsPerPage: parseInt(process.env.POSTS_PER_PAGE || '100', 10),
  };

  console.log(chalk.blue('\n📋 Migration Configuration:'));
  console.log(chalk.dim(`  WordPress URL: ${config.wpBaseUrl}`));
  console.log(chalk.dim(`  Output Directory: ${config.outputDir}`));
  console.log(chalk.dim(`  Delay between requests: ${config.delay}ms`));
  console.log(chalk.dim(`  Posts per page: ${config.postsPerPage}`));
  console.log();

  return config;
}

/**
 * Main migration function
 */
async function migrate() {
  console.log(chalk.bold.blue('\n🚢 Old Salt Blog Migration\n'));
  console.log(chalk.dim('Migrating from WordPress to Astro...\n'));

  const config = loadConfig();

  // Initialize stats
  const stats: MigrationStats = {
    postsTotal: 0,
    postsSuccess: 0,
    postsFailed: 0,
    pagesTotal: 0,
    pagesSuccess: 0,
    pagesFailed: 0,
    errors: [],
    startTime: new Date().toISOString(),
  };

  try {
    // Step 1: Fetch all data from WordPress
    console.log(chalk.blue('📥 Step 1: Fetching data from WordPress...'));
    const { posts, pages, lookups } = await fetchAllData(config);

    stats.postsTotal = posts.length;
    stats.pagesTotal = pages.length;

    console.log(chalk.green(`✓ Fetched ${posts.length} posts and ${pages.length} pages`));
    console.log(chalk.dim(`  Categories: ${lookups.categories.size}`));
    console.log(chalk.dim(`  Tags: ${lookups.tags.size}`));
    console.log(chalk.dim(`  Users: ${lookups.users.size}`));
    console.log(chalk.dim(`  Media: ${lookups.media.size}`));
    console.log();

    // Step 2: Write posts to disk (conversion happens in writeAllPosts)
    console.log(chalk.blue('💾 Step 2: Writing posts to disk...'));
    await writeAllPosts(posts, lookups, config.outputDir, stats);
    console.log();

    // Step 3: Write pages to disk (conversion happens in writeAllPages)
    console.log(chalk.blue('💾 Step 3: Writing pages to disk...'));
    await writeAllPages(pages, lookups, config.outputDir, stats);
    console.log();

    // Step 4: Write migration report
    stats.endTime = new Date().toISOString();
    const startTime = new Date(stats.startTime).getTime();
    const endTime = new Date(stats.endTime).getTime();
    stats.duration = Math.round((endTime - startTime) / 1000);

    console.log(chalk.blue('📊 Step 4: Writing migration report...'));
    writeStats(stats, '.');
    console.log();

    // Final summary
    console.log(chalk.bold.green('✨ Migration Complete!\n'));
    console.log(chalk.bold('Summary:'));
    console.log(chalk.dim('─'.repeat(50)));
    console.log(chalk.green(`  ✓ Posts: ${stats.postsSuccess}/${stats.postsTotal} successfully migrated`));
    console.log(chalk.green(`  ✓ Pages: ${stats.pagesSuccess}/${stats.pagesTotal} successfully migrated`));

    if (stats.postsFailed > 0 || stats.pagesFailed > 0) {
      console.log(chalk.yellow(`  ⚠ Failed: ${stats.postsFailed} posts, ${stats.pagesFailed} pages`));
    }

    console.log(chalk.dim(`  ⏱ Duration: ${stats.duration} seconds`));
    console.log(chalk.dim('─'.repeat(50)));

    if (stats.errors.length > 0) {
      console.log(chalk.yellow(`\n⚠ ${stats.errors.length} errors occurred. See migration-report.json for details.\n`));
    } else {
      console.log(chalk.green('\n🎉 No errors! All content migrated successfully.\n'));
    }

  } catch (error) {
    console.error(chalk.red('\n❌ Migration failed with error:'));
    console.error(chalk.red(error instanceof Error ? error.message : String(error)));

    if (error instanceof Error && error.stack) {
      console.error(chalk.dim(error.stack));
    }

    process.exit(1);
  }
}

// Run migration if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  migrate().catch(error => {
    console.error(chalk.red('Fatal error:'), error);
    process.exit(1);
  });
}

export { migrate, loadConfig };
