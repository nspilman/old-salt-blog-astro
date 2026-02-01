import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import type { WPPost, WPPage, LookupMaps, MigrationStats } from './types.js';
import { convertPostToMarkdown, convertPageToMarkdown } from './converter.js';

/**
 * Write a single post to disk
 */
export async function writePost(
  post: WPPost,
  lookups: LookupMaps,
  outputDir: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Convert post to markdown
    const markdown = convertPostToMarkdown(post, lookups);

    // Create output directory if it doesn't exist
    const blogDir = path.join(outputDir, 'blog');
    if (!fs.existsSync(blogDir)) {
      fs.mkdirSync(blogDir, { recursive: true });
    }

    // Write file
    const filePath = path.join(blogDir, `${post.slug}.md`);
    fs.writeFileSync(filePath, markdown, 'utf-8');

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}

/**
 * Write a single page to disk
 */
export async function writePage(
  page: WPPage,
  lookups: LookupMaps,
  outputDir: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Convert page to markdown
    const markdown = convertPageToMarkdown(page, lookups);

    // Create output directory if it doesn't exist
    const pagesDir = path.join(outputDir, 'pages');
    if (!fs.existsSync(pagesDir)) {
      fs.mkdirSync(pagesDir, { recursive: true });
    }

    // Write file
    const filePath = path.join(pagesDir, `${page.slug}.md`);
    fs.writeFileSync(filePath, markdown, 'utf-8');

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}

/**
 * Write all posts to disk
 */
export async function writeAllPosts(
  posts: WPPost[],
  lookups: LookupMaps,
  outputDir: string,
  stats: MigrationStats
): Promise<void> {
  console.log(chalk.blue(`\nWriting ${posts.length} posts to disk...`));

  stats.postsTotal = posts.length;

  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];
    const result = await writePost(post, lookups, outputDir);

    if (result.success) {
      stats.postsSuccess++;
      if ((i + 1) % 10 === 0) {
        console.log(
          chalk.green(`  Written ${i + 1}/${posts.length} posts...`)
        );
      }
    } else {
      stats.postsFailed++;
      stats.errors.push({
        type: 'post',
        slug: post.slug,
        message: result.error || 'Unknown error',
      });
      console.error(
        chalk.red(`  Failed to write post ${post.slug}: ${result.error}`)
      );
    }
  }

  console.log(
    chalk.green(
      `✓ Completed writing posts: ${stats.postsSuccess} success, ${stats.postsFailed} failed`
    )
  );
}

/**
 * Write all pages to disk
 */
export async function writeAllPages(
  pages: WPPage[],
  lookups: LookupMaps,
  outputDir: string,
  stats: MigrationStats
): Promise<void> {
  console.log(chalk.blue(`\nWriting ${pages.length} pages to disk...`));

  stats.pagesTotal = pages.length;

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const result = await writePage(page, lookups, outputDir);

    if (result.success) {
      stats.pagesSuccess++;
      if ((i + 1) % 5 === 0) {
        console.log(
          chalk.green(`  Written ${i + 1}/${pages.length} pages...`)
        );
      }
    } else {
      stats.pagesFailed++;
      stats.errors.push({
        type: 'page',
        slug: page.slug,
        message: result.error || 'Unknown error',
      });
      console.error(
        chalk.red(`  Failed to write page ${page.slug}: ${result.error}`)
      );
    }
  }

  console.log(
    chalk.green(
      `✓ Completed writing pages: ${stats.pagesSuccess} success, ${stats.pagesFailed} failed`
    )
  );
}

/**
 * Write migration statistics to disk
 */
export function writeStats(stats: MigrationStats, outputDir: string): void {
  // Calculate duration if not already set
  if (!stats.endTime) {
    stats.endTime = new Date().toISOString();
  }

  if (stats.duration === undefined) {
    const start = new Date(stats.startTime).getTime();
    const end = new Date(stats.endTime).getTime();
    stats.duration = Math.round((end - start) / 1000); // Duration in seconds
  }

  // Write to migration-report.json
  const reportPath = path.join(outputDir, 'migration-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(stats, null, 2), 'utf-8');

  console.log(chalk.blue(`\n📊 Migration Report:`));
  console.log(chalk.white(`  Posts: ${stats.postsSuccess}/${stats.postsTotal} migrated`));
  console.log(chalk.white(`  Pages: ${stats.pagesSuccess}/${stats.pagesTotal} migrated`));
  console.log(chalk.white(`  Errors: ${stats.errors.length}`));
  console.log(chalk.white(`  Duration: ${stats.duration}s`));
  console.log(chalk.white(`  Report saved to: ${reportPath}`));

  if (stats.errors.length > 0) {
    console.log(chalk.yellow(`\n⚠️  Errors encountered:`));
    stats.errors.slice(0, 10).forEach((error) => {
      console.log(chalk.yellow(`  - ${error.type} ${error.slug}: ${error.message}`));
    });
    if (stats.errors.length > 10) {
      console.log(chalk.yellow(`  ... and ${stats.errors.length - 10} more errors`));
    }
  }
}
