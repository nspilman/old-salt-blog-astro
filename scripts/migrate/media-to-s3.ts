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
const WORDPRESS_MEDIA_REGEX = /https?:\/\/(?:www\.)?oldsaltblog\.com\/wp-content\/uploads\/[^\s")]+\.(jpg|jpeg|png|gif|webp|mp4|mov|avi|pdf)/gi;

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

  // Stream download to file
  const fileStream = createWriteStream(localPath);
  await pipeline(Readable.fromWeb(response.body as any), fileStream);
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
async function migrateMedia(): Promise<void> {
  console.log(chalk.blue.bold('\n📦 WordPress Media to S3 Migration\n'));

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

  console.log(chalk.gray(`📁 Scanning markdown files in ${contentDir}...`));

  // Step 1: Find all WordPress media URLs
  const mediaUrls = await findMediaUrls(contentDir);
  stats.totalFiles = mediaUrls.size;

  console.log(chalk.green(`✓ Found ${stats.totalFiles} unique media files\n`));

  if (stats.totalFiles === 0) {
    console.log(chalk.yellow('No WordPress media URLs found. Migration complete.'));
    return;
  }

  // Create temp directory
  await fs.mkdir(TEMP_DIR, { recursive: true });

  console.log(chalk.blue('📥 Downloading and uploading media files...\n'));

  let processed = 0;

  for (const url of mediaUrls) {
    processed++;
    const s3Key = getS3Key(url);
    const localPath = path.join(TEMP_DIR, s3Key);
    const contentType = getContentType(url);

    try {
      // Download file
      console.log(chalk.gray(`[${processed}/${stats.totalFiles}] Downloading: ${path.basename(url)}`));
      await downloadFile(url, localPath);
      stats.downloaded++;

      // Upload to S3
      const mediaFile: MediaFile = { url, localPath, s3Key, contentType };
      await uploadToS3(s3Client, config, mediaFile);
      stats.uploaded++;

      // Generate S3 URL (using CloudFront or S3 URL format)
      const s3Url = `https://${config.bucket}.s3.${config.region}.amazonaws.com/${s3Key}`;

      // Replace URLs in markdown files
      const filesModified = await replaceUrlsInMarkdown(contentDir, url, s3Url);
      stats.filesReplaced += filesModified;

      console.log(chalk.green(`  ✓ Uploaded to S3: ${s3Key}`));
      console.log(chalk.gray(`  → Updated ${filesModified} markdown file(s)\n`));

      // Delete local temp file
      await fs.unlink(localPath);

    } catch (error: any) {
      stats.failed++;
      const errorMsg = error?.message || 'Unknown error';
      stats.errors.push({ url, error: errorMsg });
      console.log(chalk.red(`  ✗ Failed: ${errorMsg}\n`));
    }
  }

  // Clean up temp directory
  try {
    await fs.rm(TEMP_DIR, { recursive: true, force: true });
  } catch (error) {
    // Ignore cleanup errors
  }

  // Print summary
  const duration = ((Date.now() - stats.startTime) / 1000).toFixed(1);

  console.log(chalk.blue.bold('\n📊 Migration Summary\n'));
  console.log(chalk.gray('────────────────────────────────────────'));
  console.log(`Total media files:     ${stats.totalFiles}`);
  console.log(chalk.green(`✓ Downloaded:          ${stats.downloaded}`));
  console.log(chalk.green(`✓ Uploaded to S3:      ${stats.uploaded}`));
  console.log(chalk.green(`✓ Markdown files updated: ${stats.filesReplaced}`));
  console.log(chalk.red(`✗ Failed:              ${stats.failed}`));
  console.log(chalk.gray(`⏱  Duration:            ${duration}s`));
  console.log(chalk.gray('────────────────────────────────────────\n'));

  if (stats.errors.length > 0) {
    console.log(chalk.yellow('⚠️  Errors encountered:\n'));
    for (const { url, error } of stats.errors) {
      console.log(chalk.red(`  ✗ ${url}`));
      console.log(chalk.gray(`    ${error}\n`));
    }
  }

  if (stats.uploaded === stats.totalFiles) {
    console.log(chalk.green.bold('✅ Migration complete! All media files uploaded to S3.\n'));
  } else {
    console.log(chalk.yellow('⚠️  Migration completed with errors. Check the error log above.\n'));
    process.exit(1);
  }
}

// Run migration if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  migrateMedia().catch((error) => {
    console.error(chalk.red('\n❌ Fatal error:'), error);
    process.exit(1);
  });
}

export { migrateMedia };
