import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import chalk from 'chalk';
import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import { comments, type NewComment } from '../../src/db/schema';

// Load environment variables
import { config } from 'dotenv';
config();

interface LegacyComment {
	id: number;
	author: string;
	authorUrl: string;
	date: string;
	content: string;
	parent: number;
}

/**
 * Migrates comments from JSON files to Turso database
 */
async function migrateCommentsToDb() {
	const commentsDir = process.env.COMMENTS_DIR || 'src/data/comments';
	const batchSize = parseInt(process.env.BATCH_SIZE || '100', 10);

	console.log(chalk.blue('\n=== Comments Migration to Turso ===\n'));

	// Validate environment variables
	if (!process.env.TURSO_DATABASE_URL) {
		console.error(chalk.red('Error: TURSO_DATABASE_URL environment variable is required'));
		console.log('\nPlease set the following in your .env file:');
		console.log('  TURSO_DATABASE_URL=libsql://your-database.turso.io');
		console.log('  TURSO_AUTH_TOKEN=your-auth-token');
		process.exit(1);
	}

	console.log(`Comments directory: ${commentsDir}`);
	console.log(`Batch size: ${batchSize}\n`);

	// Create database connection
	const client = createClient({
		url: process.env.TURSO_DATABASE_URL!,
		authToken: process.env.TURSO_AUTH_TOKEN,
	});
	const db = drizzle(client);

	const startTime = Date.now();

	try {
		// Get all JSON files
		const files = await readdir(commentsDir);
		const jsonFiles = files.filter((f) => f.endsWith('.json'));

		console.log(chalk.blue(`Found ${jsonFiles.length} comment files to process\n`));

		let totalComments = 0;
		let processedFiles = 0;
		let failedFiles = 0;
		const allCommentsToInsert: NewComment[] = [];

		// Read all comments from JSON files
		for (const file of jsonFiles) {
			const filePath = join(commentsDir, file);
			const slug = file.replace('.json', '');

			try {
				const content = await readFile(filePath, 'utf-8');
				const legacyComments: LegacyComment[] = JSON.parse(content);

				// Convert legacy comments to new format
				for (const comment of legacyComments) {
					allCommentsToInsert.push({
						postSlug: slug,
						authorName: comment.author,
						authorEmail: null,
						authorUrl: comment.authorUrl || null,
						content: comment.content,
						parentId: comment.parent === 0 ? null : comment.parent,
						createdAt: comment.date,
						approved: true, // All legacy comments are approved
						legacyWpId: comment.id,
					});
					totalComments++;
				}

				processedFiles++;

				// Progress indicator
				if (processedFiles % 100 === 0) {
					console.log(chalk.gray(`  Processed ${processedFiles}/${jsonFiles.length} files...`));
				}
			} catch (err) {
				console.error(chalk.yellow(`  Warning: Failed to read ${file}: ${err}`));
				failedFiles++;
			}
		}

		console.log(chalk.green(`\n✓ Read ${totalComments} comments from ${processedFiles} files\n`));

		// Insert comments in batches
		console.log(chalk.blue('Inserting comments into database...\n'));

		let insertedCount = 0;
		for (let i = 0; i < allCommentsToInsert.length; i += batchSize) {
			const batch = allCommentsToInsert.slice(i, i + batchSize);

			try {
				await db.insert(comments).values(batch);
				insertedCount += batch.length;

				if (insertedCount % 500 === 0 || insertedCount === allCommentsToInsert.length) {
					console.log(
						chalk.gray(`  Inserted ${insertedCount}/${allCommentsToInsert.length} comments...`)
					);
				}
			} catch (err) {
				console.error(chalk.red(`  Error inserting batch at index ${i}: ${err}`));
				// Continue with next batch
			}
		}

		const duration = Math.round((Date.now() - startTime) / 1000);

		console.log(chalk.green('\n✓ Migration complete!\n'));
		console.log('Summary:');
		console.log(`  Files processed: ${processedFiles}`);
		console.log(`  Files failed: ${failedFiles}`);
		console.log(`  Comments migrated: ${insertedCount}`);
		console.log(`  Duration: ${duration}s\n`);
	} catch (error) {
		console.error(chalk.red('\n✗ Migration failed:'));
		console.error(error);
		process.exit(1);
	}
}

// Run if called directly
migrateCommentsToDb();
