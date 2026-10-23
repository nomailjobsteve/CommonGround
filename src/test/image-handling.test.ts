import { describe, it, expect } from 'vitest';

/**
 * Tests for image URL validation and fallback selection logic.
 * These test the same validation rules used by the ImageWithFallback component.
 */

function isValidImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Extract the best available image URL from a Qloo entity,
 * checking all known image fields in priority order.
 */
function extractEntityImage(entity: {
  image?: string;
  properties?: {
    image?: { url: string };
    images?: Array<{ url: string; type?: string }>;
  };
}): string | null {
  const images = entity.properties?.images;
  if (images && images.length > 0 && images[0].url) {
    return images[0].url;
  }
  if (entity.properties?.image?.url) {
    return entity.properties.image.url;
  }
  if (entity.image) {
    return entity.image;
  }
  return null;
}

describe('image URL validation', () => {
  it('accepts valid HTTPS URLs', () => {
    expect(isValidImageUrl('https://images.qloo.com/i/test-420x-auto.jpg')).toBe(true);
  });

  it('accepts valid HTTP URLs', () => {
    expect(isValidImageUrl('http://example.com/image.jpg')).toBe(true);
  });

  it('rejects non-URL strings', () => {
    expect(isValidImageUrl('not-a-url')).toBe(false);
  });

  it('rejects empty strings', () => {
    expect(isValidImageUrl('')).toBe(false);
  });

  it('rejects data URIs', () => {
    expect(isValidImageUrl('data:image/png;base64,abc123')).toBe(false);
  });

  it('rejects javascript: protocol', () => {
    expect(isValidImageUrl('javascript:alert(1)')).toBe(false);
  });

  it('rejects null', () => {
    expect(isValidImageUrl(null as unknown as string)).toBe(false);
  });
});

describe('extractEntityImage — Qloo image field priority', () => {
  it('prefers properties.images[0].url when available', () => {
    const entity = {
      properties: {
        images: [{ url: 'https://images.qloo.com/i/IMG1-420x-outside.jpg' }],
        image: { url: 'https://images.qloo.com/i/IMG1-420x-auto.jpg' },
      },
    };
    expect(extractEntityImage(entity)).toBe('https://images.qloo.com/i/IMG1-420x-outside.jpg');
  });

  it('falls back to properties.image.url when no images array', () => {
    const entity = {
      properties: {
        image: { url: 'https://images.qloo.com/i/IMG1-420x-auto.jpg' },
      },
    };
    expect(extractEntityImage(entity)).toBe('https://images.qloo.com/i/IMG1-420x-auto.jpg');
  });

  it('falls back to top-level image field', () => {
    const entity = {
      image: 'https://example.com/photo.jpg',
      properties: {},
    };
    expect(extractEntityImage(entity)).toBe('https://example.com/photo.jpg');
  });

  it('returns null when no image fields exist', () => {
    const entity = { properties: {} };
    expect(extractEntityImage(entity)).toBeNull();
  });

  it('returns null when properties.images is empty array', () => {
    const entity = { properties: { images: [] } };
    expect(extractEntityImage(entity)).toBeNull();
  });

  it('returns null when properties.images[0] has no url', () => {
    const entity = { properties: { images: [{ type: 'urn:image:place:unknown' }] } };
    expect(extractEntityImage(entity)).toBeNull();
  });

  it('handles entity with no properties at all', () => {
    const entity = {};
    expect(extractEntityImage(entity)).toBeNull();
  });
});

describe('image extraction matches live Qloo response structure', () => {
  it('extracts image from a realistic Insights response entity', () => {
    const liveEntity = {
      entity_id: '463DB523-0163-4766-A803-A36653273E58',
      name: 'Sear Sound',
      type: 'urn:entity:place',
      properties: {
        image: { url: 'https://images.qloo.com/i/463DB523-0163-4766-A803-A36653273E58-420x-auto.jpg' },
        images: [{ url: 'https://images.qloo.com/i/463DB523-0163-4766-A803-A36653273E58-37j7oO-420x-outside.jpg', type: 'urn:image:place:unknown' }],
        geocode: { city: 'New York', metro: 'New York City' },
      },
    };
    const img = extractEntityImage(liveEntity);
    expect(img).toBe('https://images.qloo.com/i/463DB523-0163-4766-A803-A36653273E58-37j7oO-420x-outside.jpg');
    expect(isValidImageUrl(img!)).toBe(true);
  });

  it('extracts image from a Search response entity (properties.image only)', () => {
    const searchEntity = {
      entity_id: 'DFAE4586-D382-4F09-804C-BCDBBD1A6AAC',
      name: 'Jazzanova',
      type: 'urn:entity:artist',
      properties: {
        image: { url: 'https://images.qloo.com/i/DFAE4586-D382-4F09-804C-BCDBBD1A6AAC-420x-auto.jpg' },
      },
    };
    const img = extractEntityImage(searchEntity);
    expect(img).toBe('https://images.qloo.com/i/DFAE4586-D382-4F09-804C-BCDBBD1A6AAC-420x-auto.jpg');
    expect(isValidImageUrl(img!)).toBe(true);
  });
});
