import type { APIRoute } from 'astro';
import { db, comments } from '../../../db';

export const prerender = false;

interface CommentSubmission {
	postSlug: string;
	authorName: string;
	authorEmail?: string;
	authorUrl?: string;
	content: string;
	parentId?: number;
	// Honeypot field - should be empty
	website?: string;
}

/**
 * POST /api/comments
 * Submits a new comment for moderation
 */
export const POST: APIRoute = async ({ request }) => {
	try {
		const body: CommentSubmission = await request.json();

		// Validate required fields
		if (!body.postSlug || !body.authorName || !body.content) {
			return new Response(
				JSON.stringify({
					error: 'Missing required fields: postSlug, authorName, and content are required',
				}),
				{
					status: 400,
					headers: { 'Content-Type': 'application/json' },
				}
			);
		}

		// Honeypot spam check - if the hidden "website" field is filled, it's a bot
		if (body.website) {
			// Silently accept but don't save (don't let bots know they've been caught)
			return new Response(
				JSON.stringify({
					success: true,
					message: 'Comment submitted for moderation',
				}),
				{
					status: 200,
					headers: { 'Content-Type': 'application/json' },
				}
			);
		}

		// Basic content validation
		if (body.content.length < 2) {
			return new Response(JSON.stringify({ error: 'Comment is too short' }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' },
			});
		}

		if (body.content.length > 10000) {
			return new Response(JSON.stringify({ error: 'Comment is too long (max 10000 characters)' }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' },
			});
		}

		if (body.authorName.length > 100) {
			return new Response(JSON.stringify({ error: 'Name is too long (max 100 characters)' }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' },
			});
		}

		// Sanitize content (basic - you may want to use a library like DOMPurify)
		const sanitizedContent = body.content
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/\n/g, '<br>');

		// Insert the comment (pending moderation)
		const result = await db
			.insert(comments)
			.values({
				postSlug: body.postSlug,
				authorName: body.authorName.trim(),
				authorEmail: body.authorEmail?.trim() || null,
				authorUrl: body.authorUrl?.trim() || null,
				content: `<p>${sanitizedContent}</p>`,
				parentId: body.parentId || null,
				approved: false, // New comments require moderation
			})
			.returning({ id: comments.id });

		return new Response(
			JSON.stringify({
				success: true,
				message: 'Comment submitted for moderation',
				id: result[0]?.id,
			}),
			{
				status: 201,
				headers: { 'Content-Type': 'application/json' },
			}
		);
	} catch (error) {
		console.error('Error submitting comment:', error);
		return new Response(JSON.stringify({ error: 'Failed to submit comment' }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' },
		});
	}
};
