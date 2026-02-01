import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const blog = defineCollection({
	// Load Markdown and MDX files in the `src/content/blog/` directory.
	loader: glob({ base: './src/content/blog', pattern: '**/*.{md,mdx}' }),
	// Type-check frontmatter using a schema
	schema: z.object({
		title: z.string(),
		// Transform string to Date object
		date: z.coerce.date(),
		slug: z.string(),
		excerpt: z.string().optional(),
		categories: z.array(z.string()).default([]),
		tags: z.array(z.string()).default([]),
		// Featured image as external URL (WordPress hosted)
		featuredImage: z.string().optional(),
		author: z.string(),
		description: z.string().optional(),
	}),
});

export const collections = { blog };
