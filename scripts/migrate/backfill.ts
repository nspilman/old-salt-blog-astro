import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { fetchPosts } from './api.js';
import { writePost } from './writer.js';
import type { WPPost, MigrationConfig, LookupMaps } from './types.js';

/**
 * Backfill script to fetch new WordPress posts that don't exist locally.
 * Runs automatically during every build to keep the Astro site in sync.
 */

/**
 * Get all existing local post slugs
 */
function getLocalSlugs(blogDir: string): Set<string> {
  const slugs = new Set<string>();

  if (!fs.existsSync(blogDir)) {
    console.log(chalk.yellow(`  Blog directory not found: ${blogDir}`));
    return slugs;
  }

  const files = fs.readdirSync(blogDir);

  for (const file of files) {
    if (file.endsWith('.md')) {
      // Remove .md extension to get slug
      const slug = file.replace(/\.md$/, '');
      slugs.add(slug);
    }
  }

  console.log(chalk.blue(`  Found ${slugs.size} existing local posts`));
  return slugs;
}

/**
 * Fetch comments for a specific post
 */
async function fetchCommentsForPost(
  postId: number,
  baseUrl: string,
  delayMs: number = 100
): Promise<any[]> {
  const allComments: any[] = [];
  let currentPage = 1;
  let totalPages = 1;

  while (currentPage <= totalPages) {
    const url = `${baseUrl}/wp-json/wp/v2/comments?post=${postId}&per_page=100&page=${currentPage}`;

    try {
      const response = await fetch(url);

      if (response.status === 404) {
        // No comments for this post
        return [];
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const comments = await response.json();
      totalPages = parseInt(response.headers.get('X-WP-TotalPages') || '1', 10);
      allComments.push(...comments);

      currentPage++;

      if (currentPage <= totalPages && delayMs > 0) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    } catch (error) {
      console.error(chalk.red(`    Error fetching comments for post ${postId}: ${error instanceof Error ? error.message : String(error)}`));
      return [];
    }
  }

  return allComments;
}

/**
 * Write comments for a post to JSON file
 */
function writeCommentsForPost(slug: string, comments: any[], outputDir: string): void {
  if (comments.length === 0) {
    return;
  }

  const commentsDir = path.join(outputDir, 'comments');

  if (!fs.existsSync(commentsDir)) {
    fs.mkdirSync(commentsDir, { recursive: true });
  }

  const commentFile = path.join(commentsDir, `${slug}.json`);

  // Convert to simpler format for storage
  const storedComments = comments.map(c => ({
    id: c.id,
    author: c.author_name,
    authorUrl: c.author_url || '',
    date: c.date,
    content: c.content.rendered,
    parent: c.parent,
  }));

  fs.writeFileSync(commentFile, JSON.stringify(storedComments, null, 2));
}

/**
 * Main backfill function
 */
export async function backfill(config: MigrationConfig): Promise<void> {
  const startTime = Date.now();

  console.log(chalk.blue.bold('\n=== Starting Backfill ===\n'));
  console.log(chalk.blue(`WordPress URL: ${config.wpBaseUrl}`));
  console.log(chalk.blue(`Output directory: ${config.outputDir}`));

  // Step 1: Get local slugs
  console.log(chalk.blue('\n[Step 1] Scanning local blog posts...'));
  const blogDir = path.join(config.outputDir, 'blog');
  const localSlugs = getLocalSlugs(blogDir);

  // Step 2: Fetch all posts from WordPress
  console.log(chalk.blue('\n[Step 2] Fetching posts from WordPress...'));
  const allPosts = await fetchPosts(config.wpBaseUrl, config.delay);

  // Step 3: Identify new posts
  console.log(chalk.blue('\n[Step 3] Identifying new posts...'));
  const newPosts: WPPost[] = [];

  for (const post of allPosts) {
    if (!localSlugs.has(post.slug)) {
      newPosts.push(post);
    }
  }

  if (newPosts.length === 0) {
    console.log(chalk.green('\n✓ No new posts found - site is up to date!'));
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(chalk.blue(`\nBackfill completed in ${duration}s\n`));
    return;
  }

  console.log(chalk.yellow(`  Found ${newPosts.length} new post${newPosts.length === 1 ? '' : 's'} to fetch:\n`));

  // List the new posts
  for (const post of newPosts) {
    const date = new Date(post.date).toISOString().split('T')[0];
    console.log(chalk.yellow(`    - ${post.slug} (${date})`));
  }

  // Step 4: Fetch lookups (categories, tags, users, media) for converting posts
  console.log(chalk.blue('\n[Step 4] Fetching metadata (categories, tags, users, media)...'));

  // We need to build minimal lookups for the new posts
  const lookups: LookupMaps = {
    categories: new Map(),
    tags: new Map(),
    users: new Map(),
    media: new Map(),
  };

  // Fetch categories
  try {
    const categoriesResponse = await fetch(`${config.wpBaseUrl}/wp-json/wp/v2/categories?per_page=100`);
    if (categoriesResponse.ok) {
      const categories = await categoriesResponse.json();
      categories.forEach((cat: any) => lookups.categories.set(cat.id, cat));
      console.log(chalk.blue(`  ✓ Fetched ${categories.length} categories`));
    }
  } catch (error) {
    console.log(chalk.yellow(`  Warning: Could not fetch categories`));
  }

  // Fetch tags (first page only for efficiency)
  try {
    const tagsResponse = await fetch(`${config.wpBaseUrl}/wp-json/wp/v2/tags?per_page=100`);
    if (tagsResponse.ok) {
      const tags = await tagsResponse.json();
      tags.forEach((tag: any) => lookups.tags.set(tag.id, tag));
      console.log(chalk.blue(`  ✓ Fetched ${tags.length} tags`));
    }
  } catch (error) {
    console.log(chalk.yellow(`  Warning: Could not fetch tags`));
  }

  // Fetch users
  try {
    const usersResponse = await fetch(`${config.wpBaseUrl}/wp-json/wp/v2/users`);
    if (usersResponse.ok) {
      const users = await usersResponse.json();
      users.forEach((user: any) => lookups.users.set(user.id, user));
      console.log(chalk.blue(`  ✓ Fetched ${users.length} users`));
    }
  } catch (error) {
    console.log(chalk.yellow(`  Warning: Could not fetch users`));
  }

  // Fetch media for posts with featured_media
  const mediaIds = [...new Set(newPosts.map(p => p.featured_media).filter(id => id > 0))];
  if (mediaIds.length > 0) {
    console.log(chalk.blue(`  Fetching ${mediaIds.length} featured media items...`));
    for (const mediaId of mediaIds) {
      try {
        const mediaResponse = await fetch(`${config.wpBaseUrl}/wp-json/wp/v2/media/${mediaId}`);
        if (mediaResponse.ok) {
          const media = await mediaResponse.json();
          lookups.media.set(media.id, media);
        }
        // Small delay to avoid rate limiting
        if (config.delay > 0) {
          await new Promise(resolve => setTimeout(resolve, config.delay));
        }
      } catch (error) {
        console.log(chalk.yellow(`    Warning: Could not fetch media ${mediaId}`));
      }
    }
    console.log(chalk.blue(`  ✓ Fetched ${lookups.media.size} media items`));
  }

  // Step 5: Convert and write new posts
  console.log(chalk.blue('\n[Step 5] Converting and writing new posts...'));
  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < newPosts.length; i++) {
    const post = newPosts[i];
    try {
      const result = await writePost(post, lookups, config.outputDir);
      if (!result.success) {
        throw new Error(result.error || 'Unknown error');
      }
      successCount++;

      // Fetch and write comments for this post
      const comments = await fetchCommentsForPost(post.id, config.wpBaseUrl, config.delay);
      if (comments.length > 0) {
        writeCommentsForPost(post.slug, comments, path.join(config.outputDir, '..', 'data'));
        console.log(chalk.green(`  ✓ [${i + 1}/${newPosts.length}] ${post.slug} (${comments.length} comments)`));
      } else {
        console.log(chalk.green(`  ✓ [${i + 1}/${newPosts.length}] ${post.slug}`));
      }
    } catch (error) {
      errorCount++;
      console.error(chalk.red(`  ✗ [${i + 1}/${newPosts.length}] ${post.slug}: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  // Summary
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(chalk.blue.bold('\n=== Backfill Summary ===\n'));
  console.log(chalk.green(`  New posts added: ${successCount}`));
  if (errorCount > 0) {
    console.log(chalk.red(`  Failed: ${errorCount}`));
  }
  console.log(chalk.blue(`  Duration: ${duration}s\n`));
}

/**
 * Load configuration from environment variables
 */
function loadConfig(): MigrationConfig {
  return {
    wpBaseUrl: process.env.WP_BASE_URL || 'https://oldsaltblog.com',
    outputDir: process.env.OUTPUT_DIR || 'src/content',
    delay: parseInt(process.env.DELAY || '100', 10),
    postsPerPage: parseInt(process.env.POSTS_PER_PAGE || '100', 10),
  };
}

/**
 * CLI entry point
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  const config = loadConfig();

  backfill(config)
    .then(() => {
      console.log(chalk.green('Backfill completed successfully!'));
      process.exit(0);
    })
    .catch((error) => {
      console.error(chalk.red('\n✗ Backfill failed:'), error);
      process.exit(1);
    });
}
