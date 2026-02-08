// Shared image utilities for determining layout based on aspect ratio

// Cache for image dimensions to avoid repeated fetches
const imageDimensionsCache = new Map<string, { width: number; height: number } | null>();

// Helper to get image dimensions from URL
export async function getImageDimensions(url: string): Promise<{ width: number; height: number } | null> {
	if (imageDimensionsCache.has(url)) {
		return imageDimensionsCache.get(url) || null;
	}

	try {
		const response = await fetch(url);
		if (!response.ok) {
			imageDimensionsCache.set(url, null);
			return null;
		}
		const buffer = await response.arrayBuffer();
		const sharp = (await import('sharp')).default;
		const metadata = await sharp(Buffer.from(buffer)).metadata();
		const dimensions = metadata.width && metadata.height
			? { width: metadata.width, height: metadata.height }
			: null;
		imageDimensionsCache.set(url, dimensions);
		return dimensions;
	} catch (e) {
		imageDimensionsCache.set(url, null);
		return null;
	}
}

// Helper to determine if image is landscape (width > height)
export function isLandscape(dimensions: { width: number; height: number } | null): boolean {
	if (!dimensions) return false;
	return dimensions.width > dimensions.height;
}

// Get the appropriate CSS class for image layout
export async function getImageLayoutClass(imageUrl: string | undefined): Promise<'landscape' | 'portrait'> {
	if (!imageUrl) return 'portrait';
	const dimensions = await getImageDimensions(imageUrl);
	return isLandscape(dimensions) ? 'landscape' : 'portrait';
}
