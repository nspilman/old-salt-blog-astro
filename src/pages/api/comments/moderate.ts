import type { APIRoute } from 'astro';
import { db, comments } from '../../../db';
import { eq } from 'drizzle-orm';

export const prerender = false;

/**
 * POST /api/comments/moderate
 * Approves or deletes a comment (requires admin token)
 */
export const POST: APIRoute = async ({ request }) => {
	// Simple token-based auth - in production, use proper auth
	const authHeader = request.headers.get('Authorization');
	const adminToken = process.env.ADMIN_TOKEN;

	if (!adminToken || authHeader !== `Bearer ${adminToken}`) {
		return new Response(JSON.stringify({ error: 'Unauthorized' }), {
			status: 401,
			headers: { 'Content-Type': 'application/json' },
		});
	}

	try {
		const body = await request.json();
		const { commentId, action } = body as { commentId: number; action: 'approve' | 'delete' };

		if (!commentId || !action) {
			return new Response(JSON.stringify({ error: 'commentId and action are required' }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' },
			});
		}

		if (action === 'approve') {
			await db.update(comments).set({ approved: true }).where(eq(comments.id, commentId));
			return new Response(JSON.stringify({ success: true, message: 'Comment approved' }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' },
			});
		} else if (action === 'delete') {
			await db.delete(comments).where(eq(comments.id, commentId));
			return new Response(JSON.stringify({ success: true, message: 'Comment deleted' }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' },
			});
		}

		return new Response(JSON.stringify({ error: 'Invalid action' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' },
		});
	} catch (error) {
		console.error('Error moderating comment:', error);
		return new Response(JSON.stringify({ error: 'Failed to moderate comment' }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' },
		});
	}
};

/**
 * GET /api/comments/moderate
 * Returns all pending (unapproved) comments
 */
export const GET: APIRoute = async ({ request }) => {
	const authHeader = request.headers.get('Authorization');
	const adminToken = process.env.ADMIN_TOKEN;

	if (!adminToken || authHeader !== `Bearer ${adminToken}`) {
		return new Response(JSON.stringify({ error: 'Unauthorized' }), {
			status: 401,
			headers: { 'Content-Type': 'application/json' },
		});
	}

	try {
		const pendingComments = await db
			.select()
			.from(comments)
			.where(eq(comments.approved, false))
			.orderBy(comments.createdAt);

		return new Response(JSON.stringify(pendingComments), {
			status: 200,
			headers: { 'Content-Type': 'application/json' },
		});
	} catch (error) {
		console.error('Error fetching pending comments:', error);
		return new Response(JSON.stringify({ error: 'Failed to fetch pending comments' }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' },
		});
	}
};
