import type { APIRoute } from 'astro';
import { db, comments } from '../../../db';
import { eq, asc, and } from 'drizzle-orm';

export const prerender = false;

/**
 * GET /api/comments/[slug]
 * Returns all approved comments for a given post slug
 */
export const GET: APIRoute = async ({ params }) => {
	const { slug } = params;

	if (!slug) {
		return new Response(JSON.stringify({ error: 'Slug is required' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' },
		});
	}

	try {
		const postComments = await db
			.select()
			.from(comments)
			.where(and(eq(comments.postSlug, slug), eq(comments.approved, true)))
			.orderBy(asc(comments.createdAt));

		return new Response(JSON.stringify(postComments), {
			status: 200,
			headers: {
				'Content-Type': 'application/json',
				'Cache-Control': 'public, max-age=60', // Cache for 1 minute
			},
		});
	} catch (error) {
		console.error('Error fetching comments:', error);
		return new Response(JSON.stringify({ error: 'Failed to fetch comments' }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' },
		});
	}
};
