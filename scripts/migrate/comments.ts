import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import chalk from 'chalk';
import type { WPComment, WPPost } from './types';

/**
 * Fetches data from WordPress REST API with error handling
 */
async function fetchFromWP<T>(url: string): Promise<{ data: T; totalPages: number }> {
  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    const totalPages = parseInt(response.headers.get('X-WP-TotalPages') || '1', 10);

    return { data, totalPages };
  } catch (error) {
    throw new Error(`Failed to fetch from ${url}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Delays execution for rate limiting
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetches all comments for a specific post
 */
async function fetchCommentsForPost(
  baseUrl: string,
  postId: number,
  delayMs: number = 0
): Promise<WPComment[]> {
  const allComments: WPComment[] = [];
  let currentPage = 1;
  let totalPages = 1;

  while (currentPage <= totalPages) {
    const url = `${baseUrl}/wp-json/wp/v2/comments?post=${postId}&per_page=100&page=${currentPage}`;

    try {
      const { data, totalPages: total } = await fetchFromWP<WPComment[]>(url);
      totalPages = total;
      allComments.push(...data);
      currentPage++;

      if (currentPage <= totalPages && delayMs > 0) {
        await delay(delayMs);
      }
    } catch (error) {
      // If there's an error (like 404 for no comments), just return what we have
      break;
    }
  }

  return allComments;
}

/**
 * Fetches all posts (just id and slug) to know which posts to fetch comments for
 */
async function fetchAllPosts(
  baseUrl: string,
  delayMs: number = 0
): Promise<WPPost[]> {
  const allPosts: WPPost[] = [];
  let currentPage = 1;
  let totalPages = 1;

  console.log(chalk.blue('Fetching posts...'));

  while (currentPage <= totalPages) {
    const url = `${baseUrl}/wp-json/wp/v2/posts?per_page=100&page=${currentPage}`;
    const { data, totalPages: total } = await fetchFromWP<WPPost[]>(url);

    totalPages = total;
    allPosts.push(...data);

    console.log(`  Fetched page ${currentPage}/${totalPages} (${data.length} posts)`);

    currentPage++;

    if (currentPage <= totalPages && delayMs > 0) {
      await delay(delayMs);
    }
  }

  console.log(chalk.green(`✓ Fetched ${allPosts.length} total posts`));
  return allPosts;
}

/**
 * Simplified comment format for storage
 */
interface StoredComment {
  id: number;
  author: string;
  authorUrl: string;
  date: string;
  content: string;
  parent: number;
}

/**
 * Converts WPComment to simplified StoredComment format
 */
function convertComment(comment: WPComment): StoredComment {
  return {
    id: comment.id,
    author: comment.author_name,
    authorUrl: comment.author_url,
    date: comment.date,
    content: comment.content.rendered,
    parent: comment.parent,
  };
}

/**
 * Writes comments to JSON file
 */
async function writeCommentsToFile(
  slug: string,
  comments: WPComment[],
  outputDir: string
): Promise<void> {
  const commentsDir = join(outputDir, 'comments');

  // Ensure directory exists
  await mkdir(commentsDir, { recursive: true });

  // Convert to simplified format
  const storedComments = comments.map(convertComment);

  // Write to file
  const filePath = join(commentsDir, `${slug}.json`);
  await writeFile(filePath, JSON.stringify(storedComments, null, 2), 'utf-8');
}

/**
 * Main migration function
 */
async function migrateComments() {
  const baseUrl = process.env.WP_BASE_URL || 'https://oldsaltblog.com';
  const outputDir = process.env.OUTPUT_DIR || 'src/data';
  const delayMs = parseInt(process.env.DELAY || '100', 10);

  console.log(chalk.blue('\n=== WordPress Comment Migration ===\n'));
  console.log(`Base URL: ${baseUrl}`);
  console.log(`Output directory: ${outputDir}/comments/`);
  console.log(`Delay between requests: ${delayMs}ms\n`);

  const startTime = Date.now();

  try {
    // Step 1: Fetch all posts
    const posts = await fetchAllPosts(baseUrl, delayMs);

    // Step 2: Fetch comments for each post
    console.log(chalk.blue('\nFetching comments for each post...'));

    let totalComments = 0;
    let postsWithComments = 0;
    let processedPosts = 0;

    for (const post of posts) {
      processedPosts++;

      // Progress indicator every 100 posts
      if (processedPosts % 100 === 0) {
        console.log(chalk.gray(`  Progress: ${processedPosts}/${posts.length} posts processed...`));
      }

      const comments = await fetchCommentsForPost(baseUrl, post.id, delayMs);

      if (comments.length > 0) {
        await writeCommentsToFile(post.slug, comments, outputDir);
        totalComments += comments.length;
        postsWithComments++;

        // Log posts with many comments
        if (comments.length > 10) {
          console.log(chalk.cyan(`  ${post.slug}: ${comments.length} comments`));
        }
      }

      // Rate limiting
      if (delayMs > 0) {
        await delay(delayMs);
      }
    }

    const duration = Math.round((Date.now() - startTime) / 1000);

    console.log(chalk.green('\n✓ Comment migration complete!\n'));
    console.log('Summary:');
    console.log(`  Total posts: ${posts.length}`);
    console.log(`  Posts with comments: ${postsWithComments}`);
    console.log(`  Total comments: ${totalComments}`);
    console.log(`  Duration: ${duration}s`);
    console.log(`  Output: ${outputDir}/comments/\n`);

  } catch (error) {
    console.error(chalk.red('\n✗ Migration failed:'));
    console.error(error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  migrateComments();
}

export { migrateComments };
