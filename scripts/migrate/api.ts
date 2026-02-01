import type {
  WPPost,
  WPCategory,
  WPTag,
  WPMedia,
  WPUser,
  WPPage,
  LookupMaps,
  MigrationConfig,
} from './types';

/**
 * Fetches data from WordPress REST API with error handling
 */
async function fetchFromWP<T>(url: string): Promise<{ data: T; totalPages: number }> {
  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    const totalPages = parseInt(response.headers.get('X-WP-TotalPages') || '1', 10);

    return { data, totalPages };
  } catch (error) {
    throw new Error(`Failed to fetch from ${url}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Delays execution for rate limiting
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetches all posts from WordPress, handling pagination
 */
export async function fetchPosts(
  baseUrl: string,
  delayMs: number = 0
): Promise<WPPost[]> {
  const allPosts: WPPost[] = [];
  let currentPage = 1;
  let totalPages = 1;

  console.log('Fetching posts...');

  while (currentPage <= totalPages) {
    const url = `${baseUrl}/wp-json/wp/v2/posts?per_page=100&page=${currentPage}`;
    const { data, totalPages: total } = await fetchFromWP<WPPost[]>(url);

    totalPages = total;
    allPosts.push(...data);

    console.log(`  Fetched page ${currentPage}/${totalPages} (${data.length} posts)`);

    currentPage++;

    if (currentPage <= totalPages && delayMs > 0) {
      await delay(delayMs);
    }
  }

  console.log(`✓ Fetched ${allPosts.length} total posts`);
  return allPosts;
}

/**
 * Fetches all categories from WordPress
 */
export async function fetchCategories(
  baseUrl: string,
  delayMs: number = 0
): Promise<WPCategory[]> {
  const allCategories: WPCategory[] = [];
  let currentPage = 1;
  let totalPages = 1;

  console.log('Fetching categories...');

  while (currentPage <= totalPages) {
    const url = `${baseUrl}/wp-json/wp/v2/categories?per_page=100&page=${currentPage}`;
    const { data, totalPages: total } = await fetchFromWP<WPCategory[]>(url);

    totalPages = total;
    allCategories.push(...data);

    console.log(`  Fetched page ${currentPage}/${totalPages} (${data.length} categories)`);

    currentPage++;

    if (currentPage <= totalPages && delayMs > 0) {
      await delay(delayMs);
    }
  }

  console.log(`✓ Fetched ${allCategories.length} total categories`);
  return allCategories;
}

/**
 * Fetches all tags from WordPress, handling pagination
 */
export async function fetchTags(
  baseUrl: string,
  delayMs: number = 0
): Promise<WPTag[]> {
  const allTags: WPTag[] = [];
  let currentPage = 1;
  let totalPages = 1;

  console.log('Fetching tags...');

  while (currentPage <= totalPages) {
    const url = `${baseUrl}/wp-json/wp/v2/tags?per_page=100&page=${currentPage}`;
    const { data, totalPages: total } = await fetchFromWP<WPTag[]>(url);

    totalPages = total;
    allTags.push(...data);

    console.log(`  Fetched page ${currentPage}/${totalPages} (${data.length} tags)`);

    currentPage++;

    if (currentPage <= totalPages && delayMs > 0) {
      await delay(delayMs);
    }
  }

  console.log(`✓ Fetched ${allTags.length} total tags`);
  return allTags;
}

/**
 * Fetches all media from WordPress, handling pagination
 */
export async function fetchMedia(
  baseUrl: string,
  delayMs: number = 0
): Promise<WPMedia[]> {
  const allMedia: WPMedia[] = [];
  let currentPage = 1;
  let totalPages = 1;

  console.log('Fetching media...');

  while (currentPage <= totalPages) {
    const url = `${baseUrl}/wp-json/wp/v2/media?per_page=100&page=${currentPage}`;
    const { data, totalPages: total } = await fetchFromWP<WPMedia[]>(url);

    totalPages = total;
    allMedia.push(...data);

    console.log(`  Fetched page ${currentPage}/${totalPages} (${data.length} media items)`);

    currentPage++;

    if (currentPage <= totalPages && delayMs > 0) {
      await delay(delayMs);
    }
  }

  console.log(`✓ Fetched ${allMedia.length} total media items`);
  return allMedia;
}

/**
 * Fetches all users from WordPress
 */
export async function fetchUsers(
  baseUrl: string,
  delayMs: number = 0
): Promise<WPUser[]> {
  const allUsers: WPUser[] = [];
  let currentPage = 1;
  let totalPages = 1;

  console.log('Fetching users...');

  while (currentPage <= totalPages) {
    const url = `${baseUrl}/wp-json/wp/v2/users?per_page=100&page=${currentPage}`;
    const { data, totalPages: total } = await fetchFromWP<WPUser[]>(url);

    totalPages = total;
    allUsers.push(...data);

    console.log(`  Fetched page ${currentPage}/${totalPages} (${data.length} users)`);

    currentPage++;

    if (currentPage <= totalPages && delayMs > 0) {
      await delay(delayMs);
    }
  }

  console.log(`✓ Fetched ${allUsers.length} total users`);
  return allUsers;
}

/**
 * Fetches all pages from WordPress
 */
export async function fetchPages(
  baseUrl: string,
  delayMs: number = 0
): Promise<WPPage[]> {
  const allPages: WPPage[] = [];
  let currentPage = 1;
  let totalPages = 1;

  console.log('Fetching pages...');

  while (currentPage <= totalPages) {
    const url = `${baseUrl}/wp-json/wp/v2/pages?per_page=100&page=${currentPage}`;
    const { data, totalPages: total } = await fetchFromWP<WPPage[]>(url);

    totalPages = total;
    allPages.push(...data);

    console.log(`  Fetched page ${currentPage}/${totalPages} (${data.length} pages)`);

    currentPage++;

    if (currentPage <= totalPages && delayMs > 0) {
      await delay(delayMs);
    }
  }

  console.log(`✓ Fetched ${allPages.length} total pages`);
  return allPages;
}

/**
 * Builds lookup maps for easy ID -> entity resolution
 */
export function buildLookupMaps(
  categories: WPCategory[],
  tags: WPTag[],
  users: WPUser[],
  media: WPMedia[]
): LookupMaps {
  console.log('Building lookup maps...');

  const categoryMap = new Map<number, WPCategory>();
  const tagMap = new Map<number, WPTag>();
  const userMap = new Map<number, WPUser>();
  const mediaMap = new Map<number, WPMedia>();

  for (const category of categories) {
    categoryMap.set(category.id, category);
  }

  for (const tag of tags) {
    tagMap.set(tag.id, tag);
  }

  for (const user of users) {
    userMap.set(user.id, user);
  }

  for (const mediaItem of media) {
    mediaMap.set(mediaItem.id, mediaItem);
  }

  console.log(`✓ Built lookup maps (${categoryMap.size} categories, ${tagMap.size} tags, ${userMap.size} users, ${mediaMap.size} media)`);

  return {
    categories: categoryMap,
    tags: tagMap,
    users: userMap,
    media: mediaMap,
  };
}

/**
 * Orchestrates fetching all data from WordPress
 */
export async function fetchAllData(config: MigrationConfig) {
  console.log('\n=== Starting WordPress data fetch ===\n');
  console.log(`Source: ${config.wpBaseUrl}`);
  console.log(`Rate limit delay: ${config.delay}ms\n`);

  // Fetch all data
  const [categories, tags, users, mediaItems, posts, pages] = await Promise.all([
    fetchCategories(config.wpBaseUrl, config.delay),
    fetchTags(config.wpBaseUrl, config.delay),
    fetchUsers(config.wpBaseUrl, config.delay),
    fetchMedia(config.wpBaseUrl, config.delay),
    fetchPosts(config.wpBaseUrl, config.delay),
    fetchPages(config.wpBaseUrl, config.delay),
  ]);

  // Build lookup maps
  const lookups = buildLookupMaps(categories, tags, users, mediaItems);

  console.log('\n=== Fetch complete ===\n');

  return {
    posts,
    pages,
    lookups,
  };
}
