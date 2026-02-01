import { getCollection } from 'astro:content';
import rss from '@astrojs/rss';
import { SITE_DESCRIPTION, SITE_TITLE } from '../consts';

export async function GET(context) {
	const posts = await getCollection('blog');

	// Sort posts by date descending (newest first) and limit to 50 most recent
	const sortedPosts = posts
		.sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf())
		.slice(0, 50);

	return rss({
		title: SITE_TITLE,
		description: SITE_DESCRIPTION,
		site: context.site,
		items: sortedPosts.map((post) => ({
			title: post.data.title,
			link: `/${post.data.slug}/`,
			description: post.data.description || post.data.excerpt || '',
			pubDate: post.data.date,
		})),
	});
}
