/**
 * WordPress REST API Response Types
 */

export interface WPPost {
  id: number;
  date: string;
  date_gmt: string;
  modified: string;
  modified_gmt: string;
  slug: string;
  status: string;
  type: string;
  link: string;
  title: {
    rendered: string;
  };
  content: {
    rendered: string;
    protected: boolean;
  };
  excerpt: {
    rendered: string;
    protected: boolean;
  };
  author: number;
  featured_media: number;
  comment_status: string;
  ping_status: string;
  sticky: boolean;
  template: string;
  format: string;
  meta: any[];
  categories: number[];
  tags: number[];
  yoast_head_json?: {
    og_description?: string;
    og_image?: Array<{
      url: string;
    }>;
  };
  _links: any;
}

export interface WPCategory {
  id: number;
  count: number;
  description: string;
  link: string;
  name: string;
  slug: string;
  taxonomy: string;
  parent: number;
  meta: any[];
  _links: any;
}

export interface WPTag {
  id: number;
  count: number;
  description: string;
  link: string;
  name: string;
  slug: string;
  taxonomy: string;
  meta: any[];
  _links: any;
}

export interface WPMedia {
  id: number;
  date: string;
  date_gmt: string;
  modified: string;
  modified_gmt: string;
  slug: string;
  status: string;
  type: string;
  link: string;
  title: {
    rendered: string;
  };
  author: number;
  comment_status: string;
  ping_status: string;
  template: string;
  meta: any[];
  description: {
    rendered: string;
  };
  caption: {
    rendered: string;
  };
  alt_text: string;
  media_type: string;
  mime_type: string;
  media_details: {
    width: number;
    height: number;
    file: string;
    sizes: {
      [key: string]: {
        file: string;
        width: number;
        height: number;
        mime_type: string;
        source_url: string;
      };
    };
    image_meta: any;
  };
  source_url: string;
  _links: any;
}

export interface WPUser {
  id: number;
  name: string;
  url: string;
  description: string;
  link: string;
  slug: string;
  avatar_urls: {
    [size: string]: string;
  };
  meta: any[];
  _links: any;
}

export interface WPPage {
  id: number;
  date: string;
  date_gmt: string;
  modified: string;
  modified_gmt: string;
  slug: string;
  status: string;
  type: string;
  link: string;
  title: {
    rendered: string;
  };
  content: {
    rendered: string;
    protected: boolean;
  };
  excerpt: {
    rendered: string;
    protected: boolean;
  };
  author: number;
  featured_media: number;
  parent: number;
  menu_order: number;
  comment_status: string;
  ping_status: string;
  template: string;
  meta: any[];
  yoast_head_json?: {
    og_description?: string;
    og_image?: Array<{
      url: string;
    }>;
  };
  _links: any;
}

export interface WPComment {
  id: number;
  post: number;
  parent: number;
  author: number;
  author_name: string;
  author_url: string;
  date: string;
  date_gmt: string;
  content: {
    rendered: string;
  };
  link: string;
  status: string;
  type: string;
  author_avatar_urls: {
    [size: string]: string;
  };
  meta: any[];
  _links: any;
}

/**
 * Internal Migration Types
 */

export interface MigrationPost {
  slug: string;
  title: string;
  date: string;
  excerpt: string;
  content: string;
  categories: string[];
  tags: string[];
  author: string;
  featuredImage?: string;
  description?: string;
}

export interface MigrationPage {
  slug: string;
  title: string;
  date: string;
  content: string;
  author: string;
  featuredImage?: string;
  description?: string;
}

export interface MigrationConfig {
  wpBaseUrl: string;
  outputDir: string;
  delay: number;
  postsPerPage: number;
}

export interface MigrationStats {
  postsTotal: number;
  postsSuccess: number;
  postsFailed: number;
  pagesTotal: number;
  pagesSuccess: number;
  pagesFailed: number;
  errors: Array<{
    type: string;
    slug: string;
    message: string;
  }>;
  startTime: string;
  endTime?: string;
  duration?: number;
}

export interface LookupMaps {
  categories: Map<number, WPCategory>;
  tags: Map<number, WPTag>;
  users: Map<number, WPUser>;
  media: Map<number, WPMedia>;
}
