import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Comments table schema
 * Stores both legacy WordPress comments and new comments
 */
export const comments = sqliteTable('comments', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	postSlug: text('post_slug').notNull(),
	authorName: text('author_name').notNull(),
	authorEmail: text('author_email'),
	authorUrl: text('author_url'),
	content: text('content').notNull(),
	parentId: integer('parent_id'),
	createdAt: text('created_at')
		.notNull()
		.default(sql`CURRENT_TIMESTAMP`),
	approved: integer('approved', { mode: 'boolean' }).notNull().default(false),
	// Track legacy WordPress comment IDs for migration
	legacyWpId: integer('legacy_wp_id'),
});

// Type exports for use in application code
export type Comment = typeof comments.$inferSelect;
export type NewComment = typeof comments.$inferInsert;
