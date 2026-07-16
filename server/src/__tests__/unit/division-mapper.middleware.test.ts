import { describe, it, expect } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { divisionRequestMapper, divisionResponseMapper } from '../../middleware/division-mapper.middleware';

function createMockRequest(overrides: Partial<Request> = {}): Partial<Request> {
  return {
    query: {},
    body: {},
    ...overrides,
  };
}

describe('Division Mapper Middleware', () => {
  describe('divisionRequestMapper', () => {
    it('should map query.division to query.track', () => {
      const req = createMockRequest({ query: { division: 'Platform' } });
      let nextCalled = false;

      divisionRequestMapper(
        req as Request,
        {} as Response,
        () => { nextCalled = true; }
      );

      expect(req.query!.track).toBe('Platform');
      expect(req.query!.division).toBeUndefined();
      expect(nextCalled).toBe(true);
    });

    it('should map body.division to body.track', () => {
      const req = createMockRequest({ body: { division: 'Infrastructure' } });
      let nextCalled = false;

      divisionRequestMapper(
        req as Request,
        {} as Response,
        () => { nextCalled = true; }
      );

      expect(req.body.track).toBe('Infrastructure');
      expect(req.body.division).toBeUndefined();
      expect(nextCalled).toBe(true);
    });

    it('should map both query and body division fields simultaneously', () => {
      const req = createMockRequest({
        query: { division: 'Frontend' },
        body: { division: 'Backend' },
      });

      divisionRequestMapper(req as Request, {} as Response, () => {});

      expect(req.query!.track).toBe('Frontend');
      expect(req.query!.division).toBeUndefined();
      expect(req.body.track).toBe('Backend');
      expect(req.body.division).toBeUndefined();
    });

    it('should not modify request when no division field is present', () => {
      const req = createMockRequest({
        query: { team: 'TeamAlpha' },
        body: { name: 'Test' },
      });

      divisionRequestMapper(req as Request, {} as Response, () => {});

      expect(req.query!.team).toBe('TeamAlpha');
      expect(req.query!.track).toBeUndefined();
      expect(req.body.name).toBe('Test');
      expect(req.body.track).toBeUndefined();
    });

    it('should preserve other query parameters when mapping division', () => {
      const req = createMockRequest({
        query: { division: 'Platform', team: 'TeamAlpha', period: 'quarter' },
      });

      divisionRequestMapper(req as Request, {} as Response, () => {});

      expect(req.query!.track).toBe('Platform');
      expect(req.query!.team).toBe('TeamAlpha');
      expect(req.query!.period).toBe('quarter');
      expect(req.query!.division).toBeUndefined();
    });

    it('should preserve other body fields when mapping division', () => {
      const req = createMockRequest({
        body: { division: 'Data', team: 'TeamBeta', priority: 'high' },
      });

      divisionRequestMapper(req as Request, {} as Response, () => {});

      expect(req.body.track).toBe('Data');
      expect(req.body.team).toBe('TeamBeta');
      expect(req.body.priority).toBe('high');
      expect(req.body.division).toBeUndefined();
    });

    it('should handle undefined body gracefully', () => {
      const req = createMockRequest({ body: undefined });
      let nextCalled = false;

      divisionRequestMapper(
        req as Request,
        {} as Response,
        () => { nextCalled = true; }
      );

      expect(nextCalled).toBe(true);
    });

    it('should always call next()', () => {
      const req = createMockRequest();
      let nextCalled = false;

      divisionRequestMapper(
        req as Request,
        {} as Response,
        () => { nextCalled = true; }
      );

      expect(nextCalled).toBe(true);
    });
  });

  describe('divisionResponseMapper', () => {
    it('should rename "track" to "division" in a flat object', () => {
      const input = { track: 'Platform', team: 'TeamAlpha' };
      const result = divisionResponseMapper(input);

      expect(result).toEqual({ division: 'Platform', team: 'TeamAlpha' });
    });

    it('should rename "track" in nested objects', () => {
      const input = {
        team: 'TeamAlpha',
        details: {
          track: 'Infrastructure',
          projects: 5,
        },
      };
      const result = divisionResponseMapper(input);

      expect(result).toEqual({
        team: 'TeamAlpha',
        details: {
          division: 'Infrastructure',
          projects: 5,
        },
      });
    });

    it('should rename "track" in arrays of objects', () => {
      const input = [
        { track: 'Platform', count: 3 },
        { track: 'Data', count: 2 },
      ];
      const result = divisionResponseMapper(input);

      expect(result).toEqual([
        { division: 'Platform', count: 3 },
        { division: 'Data', count: 2 },
      ]);
    });

    it('should handle deeply nested structures', () => {
      const input = {
        teams: [
          {
            name: 'TeamAlpha',
            divisions: [
              {
                track: 'Frontend',
                projects: [
                  { name: 'Project1', track: 'Frontend' },
                ],
              },
            ],
          },
        ],
      };
      const result = divisionResponseMapper(input);

      expect(result).toEqual({
        teams: [
          {
            name: 'TeamAlpha',
            divisions: [
              {
                division: 'Frontend',
                projects: [
                  { name: 'Project1', division: 'Frontend' },
                ],
              },
            ],
          },
        ],
      });
    });

    it('should return primitive values unchanged', () => {
      expect(divisionResponseMapper('hello')).toBe('hello');
      expect(divisionResponseMapper(42)).toBe(42);
      expect(divisionResponseMapper(true)).toBe(true);
      expect(divisionResponseMapper(null)).toBe(null);
      expect(divisionResponseMapper(undefined)).toBe(undefined);
    });

    it('should handle empty objects', () => {
      expect(divisionResponseMapper({})).toEqual({});
    });

    it('should handle empty arrays', () => {
      expect(divisionResponseMapper([])).toEqual([]);
    });

    it('should not rename keys that are not exactly "track"', () => {
      const input = { tracking: 'yes', racetrack: 'fast', track: 'Platform' };
      const result = divisionResponseMapper(input);

      expect(result).toEqual({ tracking: 'yes', racetrack: 'fast', division: 'Platform' });
    });

    it('should handle mixed arrays with objects and primitives', () => {
      const input = [
        { track: 'Platform' },
        'string',
        42,
        null,
        { name: 'test' },
      ];
      const result = divisionResponseMapper(input);

      expect(result).toEqual([
        { division: 'Platform' },
        'string',
        42,
        null,
        { name: 'test' },
      ]);
    });
  });
});
