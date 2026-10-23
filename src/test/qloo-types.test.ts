import { describe, it, expect } from 'vitest';
import type { QlooResult, QlooError, QlooErrorKind, QlooInsightsParams, QlooSearchParams } from '@/types/qloo';

describe('Qloo types — error normalization', () => {
  it('QlooResult success carries data', () => {
    const result: QlooResult<string> = { success: true, data: 'test' };
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe('test');
    }
  });

  it('QlooResult failure carries error', () => {
    const error: QlooError = {
      kind: 'auth_failure' as QlooErrorKind,
      message: 'Invalid API key',
      statusCode: 401,
    };
    const result: QlooResult<string> = { success: false, error };
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.kind).toBe('auth_failure');
      expect(result.error.statusCode).toBe(401);
    }
  });

  it('all error kinds are representable', () => {
    const kinds: QlooErrorKind[] = [
      'missing_config',
      'auth_failure',
      'rate_limit',
      'network',
      'invalid_response',
      'not_found',
      'bad_request',
      'server_error',
      'unknown',
    ];
    for (const kind of kinds) {
      const error: QlooError = { kind, message: 'test', statusCode: null };
      expect(error.kind).toBe(kind);
    }
  });
});

describe('Qloo types — request parameters', () => {
  it('QlooInsightsParams has required filterType', () => {
    const params: QlooInsightsParams = {
      filterType: 'urn:entity:place',
    };
    expect(params.filterType).toBe('urn:entity:place');
    expect(params.take).toBeUndefined();
  });

  it('QlooInsightsParams with all optional fields', () => {
    const params: QlooInsightsParams = {
      filterType: 'urn:entity:movie',
      signalInterestsEntities: ['entity-1', 'entity-2'],
      signalInterestsTags: ['tag-1'],
      filterTags: ['tag-2'],
      filterLocation: '40.7,-74.0',
      filterLocationRadius: 15000,
      take: 20,
      sortBy: 'affinity',
      featureExplainability: true,
    };
    expect(params.signalInterestsEntities).toHaveLength(2);
    expect(params.featureExplainability).toBe(true);
  });

  it('QlooSearchParams requires query', () => {
    const params: QlooSearchParams = {
      query: 'jazz clubs',
    };
    expect(params.query).toBe('jazz clubs');
    expect(params.types).toBeUndefined();
  });
});
