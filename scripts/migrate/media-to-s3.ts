import fs from 'fs/promises';
import path from 'path';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import chalk from 'chalk';
import fetch from 'node-fetch';

interface S3Config {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}

interface MediaFile {
  url: string;
  localPath: string;
  s3Key: string;
  contentType: string;
}

interface MigrationStats {
  totalFiles: number;
  downloaded: number;
  uploaded: number;
  failed: number;
  filesReplaced: number;
  startTime: number;
  errors: Array<{ url: string; error: string }>;
}

const TEMP_DIR = path.join(process.cwd(), '.temp-media');
const FAILURES_FILE = path.join(process.cwd(), 'migration-failures.json');
const PROGRESS_FILE = path.join(process.cwd(), 'migration-progress.json');
const WORDPRESS_MEDIA_REGEX = /https?:\/\/(?:www\.)?oldsaltblog\.com\/wp-content\/uploads\/[^\s")]+\.(jpg|jpeg|png|gif|webp|mp4|mov|avi|pdf)/gi;

interface FailureRecord {
  url: string;
  error: string;
  timestamp: string;
  attempts: number;
}

interface ProgressRecord {
  completedUrls: string[];
  lastUpdated: string;
}

/**
 * Load existing failures from file
 */
async function loadFailures(): Promise<Map<string, FailureRecord>> {
  try {
    const data = await fs.readFile(FAILURES_FILE, 'utf-8');
    const failures: FailureRecord[] = JSON.parse(data);
    return new Map(failures.map(f => [f.url, f]));
  } catch {
    return new Map();
  }
}

/**
 * Save failures to file (called after each failure to avoid data loss)
 */
async function saveFailures(failures: Map<string, FailureRecord>): Promise<void> {
  const data = Array.from(failures.values());
  await fs.writeFile(FAILURES_FILE, JSON.stringify(data, null, 2));
}

/**
 * Load progress (completed URLs) from file
 */
async function loadProgress(): Promise<Set<string>> {
  try {
    const data = await fs.readFile(PROGRESS_FILE, 'utf-8');
    const progress: ProgressRecord = JSON.parse(data);
    return new Set(progress.completedUrls);
  } catch {
    return new Set();
  }
}

/**
 * Save progress to file (called periodically)
 */
async function saveProgress(completedUrls: Set<string>): Promise<void> {
  const progress: ProgressRecord = {
    completedUrls: Array.from(completedUrls),
    lastUpdated: new Date().toISOString(),
  };
  await fs.writeFile(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

/**
 * Process items with concurrency limit
 */
async function processWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  processor: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  let currentIndex = 0;

  async function worker(): Promise<void> {
    while (currentIndex < items.length) {
      const index = currentIndex++;
      const item = items[index];
      const result = await processor(item, index);
      results[index] = result;
    }
  }

  // Start workers up to concurrency limit
  const workers = Array(Math.min(concurrency, items.length))
    .fill(null)
    .map(() => worker());

  await Promise.all(workers);
  return results;
}

// Simple mutex for file operations
class Mutex {
  private locked = false;
  private queue: (() => void)[] = [];

  async acquire(): Promise<void> {
    if (!this.locked) {
      this.locked = true;
      return;
    }
    return new Promise((resolve) => {
      this.queue.push(resolve);
    });
  }

  release(): void {
    if (this.queue.length > 0) {
      const next = this.queue.shift()!;
      next();
    } else {
      this.locked = false;
    }
  }
}

/**
 * Load S3 configuration from environment variables
 */
function loadConfig(): S3Config {
  const bucket = process.env.AWS_S3_BUCKET;
  const region = process.env.AWS_REGION || 'us-east-1';
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

  if (!bucket || !accessKeyId || !secretAccessKey) {
    console.error(chalk.red('❌ Missing required environment variables:'));
    console.error(chalk.yellow('   AWS_S3_BUCKET, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY'));
    console.error(chalk.yellow('   See .env.example for configuration details'));
    process.exit(1);
  }

  return { bucket, region, accessKeyId, secretAccessKey };
}

/**
 * Create S3 client with configuration
 */
function createS3Client(config: S3Config): S3Client {
  return new S3Client({
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

/**
 * Scan all markdown files and extract WordPress media URLs
 */
async function findMediaUrls(contentDir: string): Promise<Set<string>> {
  const urls = new Set<string>();
  const files = await fs.readdir(contentDir);

  for (const file of files) {
    if (!file.endsWith('.md')) continue;

    const filePath = path.join(contentDir, file);
    const content = await fs.readFile(filePath, 'utf-8');

    // Extract all WordPress media URLs
    const matches = content.matchAll(WORDPRESS_MEDIA_REGEX);
    for (const match of matches) {
      urls.add(match[0]);
    }
  }

  return urls;
}

/**
 * Get content type from file extension
 */
function getContentType(url: string): string {
  const ext = path.extname(url).toLowerCase();
  const contentTypes: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
    '.avi': 'video/x-msvideo',
    '.pdf': 'application/pdf',
  };
  return contentTypes[ext] || 'application/octet-stream';
}

/**
 * Extract S3 key from WordPress URL
 * Preserves original path structure: uploads/2023/01/image.jpg
 */
function getS3Key(url: string): string {
  const match = url.match(/wp-content\/(uploads\/.+)$/);
  if (!match) {
    // Fallback: use filename
    return path.basename(url);
  }
  return match[1];
}

/**
 * Download media file from WordPress
 */
async function downloadFile(url: string, localPath: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download: ${response.status} ${response.statusText}`);
  }

  // Ensure directory exists
  await fs.mkdir(path.dirname(localPath), { recursive: true });

  // Stream download to file (node-fetch returns a Node.js stream)
  const fileStream = createWriteStream(localPath);
  await pipeline(response.body as any, fileStream);
}

/**
 * Upload file to S3
 */
async function uploadToS3(
  s3Client: S3Client,
  config: S3Config,
  file: MediaFile
): Promise<void> {
  const fileContent = await fs.readFile(file.localPath);

  const command = new PutObjectCommand({
    Bucket: config.bucket,
    Key: file.s3Key,
    Body: fileContent,
    ContentType: file.contentType,
    CacheControl: 'public, max-age=31536000', // Cache for 1 year
  });

  await s3Client.send(command);
}

/**
 * Replace all occurrences of old URL with new S3 URL in markdown files
 */
async function replaceUrlsInMarkdown(
  contentDir: string,
  oldUrl: string,
  newUrl: string
): Promise<number> {
  let filesModified = 0;
  const files = await fs.readdir(contentDir);

  for (const file of files) {
    if (!file.endsWith('.md')) continue;

    const filePath = path.join(contentDir, file);
    let content = await fs.readFile(filePath, 'utf-8');

    if (content.includes(oldUrl)) {
      // Replace all occurrences (case-insensitive)
      const regex = new RegExp(oldUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      content = content.replace(regex, newUrl);
      await fs.writeFile(filePath, content, 'utf-8');
      filesModified++;
    }
  }

  return filesModified;
}

/**
 * Main migration function
 */
async function migrateMedia(options: MigrationOptions = {}): Promise<void> {
  console.log(chalk.blue.bold('\n📦 WordPress Media to S3 Migration\n'));

  if (options.dryRun) {
    console.log(chalk.yellow('🔍 DRY RUN MODE - No files will be uploaded or modified\n'));
  }
  if (options.retry) {
    console.log(chalk.yellow('🔄 RETRY MODE - Processing only previously failed URLs\n'));
  }
  if (options.resume) {
    console.log(chalk.yellow('▶️  RESUME MODE - Skipping already completed URLs\n'));
  }
  if (options.limit) {
    console.log(chalk.yellow(`⚠️  Limited to ${options.limit} files for testing\n`));
  }

  const concurrency = options.concurrency || DEFAULT_CONCURRENCY;
  console.log(chalk.cyan(`🚀 Running with concurrency: ${concurrency}\n`));

  const stats: MigrationStats = {
    totalFiles: 0,
    downloaded: 0,
    uploaded: 0,
    failed: 0,
    filesReplaced: 0,
    startTime: Date.now(),
    errors: [],
  };

  const config = loadConfig();
  const s3Client = createS3Client(config);
  const contentDir = path.join(process.cwd(), 'src', 'content', 'blog');

  // Load existing failures and progress
  const existingFailures = await loadFailures();
  const completedUrls = options.resume ? await loadProgress() : new Set<string>();
  const failures = new Map<string, FailureRecord>(existingFailures);

  let mediaUrls: Set<string>;

  if (options.retry) {
    // Retry mode: only process previously failed URLs
    mediaUrls = new Set(existingFailures.keys());
    console.log(chalk.gray(`📋 Found ${mediaUrls.size} failed URLs to retry\n`));
  } else {
    console.log(chalk.gray(`📁 Scanning markdown files in ${contentDir}...`));
    mediaUrls = await findMediaUrls(contentDir);
    const totalFound = mediaUrls.size;
    console.log(chalk.green(`✓ Found ${totalFound} unique media files`));

    // Filter out already completed URLs if resuming
    if (options.resume && completedUrls.size > 0) {
      const beforeFilter = mediaUrls.size;
      mediaUrls = new Set([...mediaUrls].filter(url => !completedUrls.has(url)));
      console.log(chalk.gray(`  Skipping ${beforeFilter - mediaUrls.size} already completed`));
    }
  }

  // Apply limit if specified
  if (options.limit && options.limit < mediaUrls.size) {
    const limitedUrls = new Set<string>();
    let count = 0;
    for (const url of mediaUrls) {
      if (count >= options.limit) break;
      limitedUrls.add(url);
      count++;
    }
    mediaUrls = limitedUrls;
    console.log(chalk.yellow(`  Processing first ${mediaUrls.size} files`));
  }

  stats.totalFiles = mediaUrls.size;
  console.log('');

  if (stats.totalFiles === 0) {
    console.log(chalk.yellow('No WordPress media URLs to process. Migration complete.'));
    return;
  }

  // Create temp directory
  await fs.mkdir(TEMP_DIR, { recursive: true });

  console.log(chalk.blue('📥 Downloading and uploading media files...\n'));

  const urlArray = Array.from(mediaUrls);
  const fileMutex = new Mutex(); // For markdown file updates
  const statsMutex = new Mutex(); // For stats/progress updates
  let lastProgressSave = 0;

  await processWithConcurrency(urlArray, concurrency, async (url, index) => {
    const processed = index + 1;
    const s3Key = getS3Key(url);
    const localPath = path.join(TEMP_DIR, s3Key);
    const contentType = getContentType(url);

    try {
      if (options.dryRun) {
        console.log(chalk.gray(`[${processed}/${stats.totalFiles}] Would download: ${path.basename(url)}`));
        console.log(chalk.cyan(`  → Would upload to S3: ${s3Key}`));
        console.log(chalk.gray(`  → Would update markdown files\n`));
        await statsMutex.acquire();
        stats.downloaded++;
        stats.uploaded++;
        statsMutex.release();
        return;
      }

      // Download file
      console.log(chalk.gray(`[${processed}/${stats.totalFiles}] Downloading: ${path.basename(url)}`));
      await downloadFile(url, localPath);

      await statsMutex.acquire();
      stats.downloaded++;
      statsMutex.release();

      // Upload to S3
      const mediaFile: MediaFile = { url, localPath, s3Key, contentType };
      await uploadToS3(s3Client, config, mediaFile);

      await statsMutex.acquire();
      stats.uploaded++;
      const currentUploaded = stats.uploaded;
      statsMutex.release();

      // Generate S3 URL
      const s3Url = `https://${config.bucket}.s3.${config.region}.amazonaws.com/${s3Key}`;

      // Replace URLs in markdown files (mutex protected)
      await fileMutex.acquire();
      const filesModified = await replaceUrlsInMarkdown(contentDir, url, s3Url);
      stats.filesReplaced += filesModified;
      fileMutex.release();

      console.log(chalk.green(`  ✓ [${processed}] Uploaded: ${s3Key} (${filesModified} files updated)`));

      // Delete local temp file
      try {
        await fs.unlink(localPath);
      } catch {
        // Ignore cleanup errors
      }

      // Track success (mutex protected)
      await statsMutex.acquire();
      completedUrls.add(url);
      if (failures.has(url)) {
        failures.delete(url);
        await saveFailures(failures);
      }

      // Save progress every 100 files
      if (currentUploaded - lastProgressSave >= 100) {
        lastProgressSave = currentUploaded;
        await saveProgress(completedUrls);
        console.log(chalk.gray(`  💾 Progress saved (${currentUploaded} files completed)\n`));
      }
      statsMutex.release();

    } catch (error: any) {
      const errorMsg = error?.message || 'Unknown error';
      console.log(chalk.red(`  ✗ [${processed}] Failed: ${path.basename(url)} - ${errorMsg}`));

      await statsMutex.acquire();
      stats.failed++;
      stats.errors.push({ url, error: errorMsg });

      const existingRecord = failures.get(url);
      failures.set(url, {
        url,
        error: errorMsg,
        timestamp: new Date().toISOString(),
        attempts: (existingRecord?.attempts || 0) + 1,
      });
      await saveFailures(failures);
      statsMutex.release();
    }
  });

  // Clean up temp directory
  try {
    await fs.rm(TEMP_DIR, { recursive: true, force: true });
  } catch (error) {
    // Ignore cleanup errors
  }

  // Save final progress
  if (!options.dryRun && completedUrls.size > 0) {
    await saveProgress(completedUrls);
  }

  // Print summary
  const duration = ((Date.now() - stats.startTime) / 1000).toFixed(1);
  const durationMins = (parseFloat(duration) / 60).toFixed(1);

  console.log(chalk.blue.bold('\n📊 Migration Summary\n'));
  console.log(chalk.gray('────────────────────────────────────────'));
  console.log(`Total media files:     ${stats.totalFiles}`);
  console.log(chalk.green(`✓ Downloaded:          ${stats.downloaded}`));
  console.log(chalk.green(`✓ Uploaded to S3:      ${stats.uploaded}`));
  console.log(chalk.green(`✓ Markdown files updated: ${stats.filesReplaced}`));
  console.log(chalk.red(`✗ Failed:              ${stats.failed}`));
  console.log(chalk.gray(`⏱  Duration:            ${duration}s (${durationMins} min)`));
  console.log(chalk.gray('────────────────────────────────────────\n'));

  if (stats.errors.length > 0) {
    console.log(chalk.yellow(`⚠️  ${stats.errors.length} errors encountered`));
    console.log(chalk.gray(`   Failures saved to: ${FAILURES_FILE}`));
    console.log(chalk.gray(`   To retry failed files, run:`));
    console.log(chalk.cyan(`   npx tsx --env-file=.env scripts/migrate/media-to-s3.ts --retry\n`));

    // Show first 5 errors as examples
    const showErrors = stats.errors.slice(0, 5);
    for (const { url, error } of showErrors) {
      console.log(chalk.red(`  ✗ ${path.basename(url)}`));
      console.log(chalk.gray(`    ${error}\n`));
    }
    if (stats.errors.length > 5) {
      console.log(chalk.gray(`  ... and ${stats.errors.length - 5} more (see ${FAILURES_FILE})\n`));
    }
  }

  if (!options.dryRun && completedUrls.size > 0) {
    console.log(chalk.gray(`💾 Progress saved to: ${PROGRESS_FILE}`));
    console.log(chalk.gray(`   Total completed: ${completedUrls.size} files`));
    console.log(chalk.gray(`   To resume later: npx tsx --env-file=.env scripts/migrate/media-to-s3.ts --resume\n`));
  }

  if (stats.failed === 0) {
    console.log(chalk.green.bold('✅ Migration complete! All media files uploaded to S3.\n'));
    // Clean up progress/failures files on full success
    if (!options.dryRun) {
      try {
        await fs.unlink(PROGRESS_FILE);
        await fs.unlink(FAILURES_FILE);
      } catch {
        // Files may not exist
      }
    }
  } else {
    console.log(chalk.yellow('⚠️  Migration completed with some failures.\n'));
    // Don't exit(1) - let the process complete normally so failures are saved
  }
}

interface MigrationOptions {
  limit?: number;
  dryRun?: boolean;
  retry?: boolean;
  resume?: boolean;
  concurrency?: number;
}

const DEFAULT_CONCURRENCY = 10;

// Parse command line arguments
function parseArgs(): MigrationOptions {
  const args = process.argv.slice(2);
  const options: MigrationOptions = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' && args[i + 1]) {
      options.limit = parseInt(args[i + 1], 10);
      i++;
    }
    if (args[i] === '--concurrency' && args[i + 1]) {
      options.concurrency = parseInt(args[i + 1], 10);
      i++;
    }
    if (args[i] === '--dry-run') {
      options.dryRun = true;
    }
    if (args[i] === '--retry') {
      options.retry = true;
    }
    if (args[i] === '--resume') {
      options.resume = true;
    }
    if (args[i] === '--help') {
      console.log(`
Usage: npx tsx --env-file=.env scripts/migrate/media-to-s3.ts [options]

Options:
  --limit N        Process only N files (for testing)
  --concurrency N  Process N files in parallel (default: ${DEFAULT_CONCURRENCY})
  --dry-run        Show what would be done without making changes
  --retry          Retry only previously failed URLs from migration-failures.json
  --resume         Skip already completed URLs (reads from migration-progress.json)
  --help           Show this help message
`);
      process.exit(0);
    }
  }

  return options;
}

// Run migration if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const options = parseArgs();
  migrateMedia(options).catch((error) => {
    console.error(chalk.red('\n❌ Fatal error:'), error);
    process.exit(1);
  });
}

export { migrateMedia };
