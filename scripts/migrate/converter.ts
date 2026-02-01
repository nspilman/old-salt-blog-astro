import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import type {
  WPPost,
  WPPage,
  MigrationPost,
  MigrationPage,
  LookupMaps,
} from './types.js';

/**
 * Initialize Turndown service with custom rules for WordPress content
 */
function createTurndownService(): TurndownService {
  const turndown = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    emDelimiter: '*',
  });

  // Use GitHub-flavored markdown plugin for tables, strikethrough, etc.
  turndown.use(gfm);

  // Custom rule: Preserve YouTube and Vimeo iframes as HTML
  turndown.addRule('iframes', {
    filter: (node) => {
      if (node.nodeName === 'IFRAME') {
        const src = node.getAttribute('src') || '';
        return (
          src.includes('youtube.com') ||
          src.includes('youtu.be') ||
          src.includes('vimeo.com')
        );
      }
      return false;
    },
    replacement: (content, node) => {
      return '\n\n' + (node as HTMLElement).outerHTML + '\n\n';
    },
  });

  // Custom rule: Handle images - extract src only (ignore srcset), keep original WordPress URLs
  turndown.addRule('images', {
    filter: 'img',
    replacement: (content, node) => {
      const img = node as HTMLImageElement;
      const alt = img.getAttribute('alt') || '';
      const src = img.getAttribute('src') || '';

      // Extract just the src, ignoring srcset
      if (!src) return '';

      return `![${alt}](${src})`;
    },
  });

  // Custom rule: Handle WordPress figure/figcaption
  turndown.addRule('figures', {
    filter: 'figure',
    replacement: (content, node) => {
      const figure = node as HTMLElement;
      const img = figure.querySelector('img');
      const figcaption = figure.querySelector('figcaption');

      if (!img) return content;

      const alt = img.getAttribute('alt') || '';
      const src = img.getAttribute('src') || '';
      const caption = figcaption ? figcaption.textContent || '' : '';

      if (caption) {
        return `\n\n![${alt}](${src})\n*${caption}*\n\n`;
      }

      return `\n\n![${alt}](${src})\n\n`;
    },
  });

  return turndown;
}

/**
 * Decode HTML entities in a string
 */
function decodeHtmlEntities(text: string): string {
  const entities: { [key: string]: string } = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#039;': "'",
    '&apos;': "'",
    '&nbsp;': ' ',
    '&mdash;': '—',
    '&ndash;': '–',
    '&hellip;': '…',
    '&laquo;': '«',
    '&raquo;': '»',
    '&ldquo;': '\u201C',
    '&rdquo;': '\u201D',
    '&lsquo;': '\u2018',
    '&rsquo;': '\u2019',
  };

  let decoded = text;
  for (const [entity, char] of Object.entries(entities)) {
    decoded = decoded.replace(new RegExp(entity, 'g'), char);
  }

  // Handle numeric entities
  decoded = decoded.replace(/&#(\d+);/g, (match, dec) => {
    return String.fromCharCode(dec);
  });

  return decoded;
}

/**
 * Strip WordPress <!--more--> tags and related content
 */
function stripMoreTags(html: string): string {
  return html
    .replace(/<!--more-->/gi, '')
    .replace(/<!--more(.*?)-->/gi, '')
    .replace(/<span id="more-\d+"><\/span>/gi, '');
}

/**
 * Convert HTML content to Markdown
 */
function convertHtmlToMarkdown(html: string): string {
  const turndown = createTurndownService();

  // Strip <!--more--> tags
  let cleanHtml = stripMoreTags(html);

  // Convert to markdown
  let markdown = turndown.turndown(cleanHtml);

  // Decode HTML entities
  markdown = decodeHtmlEntities(markdown);

  // Clean up excessive newlines (max 2 consecutive)
  markdown = markdown.replace(/\n{3,}/g, '\n\n');

  return markdown.trim();
}

/**
 * Generate YAML frontmatter for a post
 */
function generatePostFrontmatter(
  post: WPPost,
  lookups: LookupMaps
): string {
  const lines: string[] = ['---'];

  // Title (decode HTML entities)
  const title = decodeHtmlEntities(post.title.rendered);
  lines.push(`title: "${title.replace(/"/g, '\\"')}"`);

  // Date
  lines.push(`date: ${post.date}`);

  // Slug
  lines.push(`slug: ${post.slug}`);

  // Excerpt (decode HTML entities, strip HTML tags)
  if (post.excerpt.rendered) {
    const excerpt = decodeHtmlEntities(
      post.excerpt.rendered.replace(/<[^>]*>/g, '')
    ).trim();
    if (excerpt) {
      lines.push(`excerpt: "${excerpt.replace(/"/g, '\\"')}"`);
    }
  }

  // Categories
  if (post.categories.length > 0) {
    const categoryNames = post.categories
      .map((id) => lookups.categories.get(id)?.name)
      .filter(Boolean);
    if (categoryNames.length > 0) {
      lines.push('categories:');
      categoryNames.forEach((name) => {
        lines.push(`  - "${name}"`);
      });
    }
  }

  // Tags
  if (post.tags.length > 0) {
    const tagNames = post.tags
      .map((id) => lookups.tags.get(id)?.name)
      .filter(Boolean);
    if (tagNames.length > 0) {
      lines.push('tags:');
      tagNames.forEach((name) => {
        lines.push(`  - "${name}"`);
      });
    }
  }

  // Featured Image (keep original WordPress URL)
  if (post.featured_media) {
    const media = lookups.media.get(post.featured_media);
    if (media?.source_url) {
      lines.push(`featuredImage: "${media.source_url}"`);
    }
  }

  // Author
  const author = lookups.users.get(post.author);
  if (author) {
    lines.push(`author: "${author.name}"`);
  }

  // Description (from Yoast SEO if available)
  if (post.yoast_head_json?.og_description) {
    const description = decodeHtmlEntities(post.yoast_head_json.og_description);
    lines.push(`description: "${description.replace(/"/g, '\\"')}"`);
  }

  lines.push('---');
  return lines.join('\n');
}

/**
 * Generate YAML frontmatter for a page
 */
function generatePageFrontmatter(
  page: WPPage,
  lookups: LookupMaps
): string {
  const lines: string[] = ['---'];

  // Title (decode HTML entities)
  const title = decodeHtmlEntities(page.title.rendered);
  lines.push(`title: "${title.replace(/"/g, '\\"')}"`);

  // Date
  lines.push(`date: ${page.date}`);

  // Slug
  lines.push(`slug: ${page.slug}`);

  // Featured Image (keep original WordPress URL)
  if (page.featured_media) {
    const media = lookups.media.get(page.featured_media);
    if (media?.source_url) {
      lines.push(`featuredImage: "${media.source_url}"`);
    }
  }

  // Author
  const author = lookups.users.get(page.author);
  if (author) {
    lines.push(`author: "${author.name}"`);
  }

  // Description (from Yoast SEO if available)
  if (page.yoast_head_json?.og_description) {
    const description = decodeHtmlEntities(page.yoast_head_json.og_description);
    lines.push(`description: "${description.replace(/"/g, '\\"')}"`);
  }

  lines.push('---');
  return lines.join('\n');
}

/**
 * Convert a WordPress post to MigrationPost format
 */
export function convertPost(
  post: WPPost,
  lookups: LookupMaps
): MigrationPost {
  const markdown = convertHtmlToMarkdown(post.content.rendered);
  const excerpt = post.excerpt.rendered
    ? decodeHtmlEntities(post.excerpt.rendered.replace(/<[^>]*>/g, '')).trim()
    : '';

  const categories = post.categories
    .map((id) => lookups.categories.get(id)?.name)
    .filter((name): name is string => Boolean(name));

  const tags = post.tags
    .map((id) => lookups.tags.get(id)?.name)
    .filter((name): name is string => Boolean(name));

  const author = lookups.users.get(post.author)?.name || 'Unknown';

  const featuredImage = post.featured_media
    ? lookups.media.get(post.featured_media)?.source_url
    : undefined;

  const description = post.yoast_head_json?.og_description
    ? decodeHtmlEntities(post.yoast_head_json.og_description)
    : undefined;

  return {
    slug: post.slug,
    title: decodeHtmlEntities(post.title.rendered),
    date: post.date,
    excerpt,
    content: markdown,
    categories,
    tags,
    author,
    featuredImage,
    description,
  };
}

/**
 * Convert a WordPress page to MigrationPage format
 */
export function convertPage(
  page: WPPage,
  lookups: LookupMaps
): MigrationPage {
  const markdown = convertHtmlToMarkdown(page.content.rendered);

  const author = lookups.users.get(page.author)?.name || 'Unknown';

  const featuredImage = page.featured_media
    ? lookups.media.get(page.featured_media)?.source_url
    : undefined;

  const description = page.yoast_head_json?.og_description
    ? decodeHtmlEntities(page.yoast_head_json.og_description)
    : undefined;

  return {
    slug: page.slug,
    title: decodeHtmlEntities(page.title.rendered),
    date: page.date,
    content: markdown,
    author,
    featuredImage,
    description,
  };
}

/**
 * Convert a post to full markdown file content (frontmatter + content)
 */
export function convertPostToMarkdown(
  post: WPPost,
  lookups: LookupMaps
): string {
  const frontmatter = generatePostFrontmatter(post, lookups);
  const content = convertHtmlToMarkdown(post.content.rendered);

  return `${frontmatter}\n\n${content}\n`;
}

/**
 * Convert a page to full markdown file content (frontmatter + content)
 */
export function convertPageToMarkdown(
  page: WPPage,
  lookups: LookupMaps
): string {
  const frontmatter = generatePageFrontmatter(page, lookups);
  const content = convertHtmlToMarkdown(page.content.rendered);

  return `${frontmatter}\n\n${content}\n`;
}
