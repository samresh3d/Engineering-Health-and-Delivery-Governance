import { describe, it, expect } from 'vitest';
import { Response } from 'express';
import { dataScopeMiddleware, readScopeMiddleware, writeScopeMiddleware, deleteScopeMiddleware, DataScopedRequest } from '../../middleware/data-scope.middleware';
import { AuthenticatedRequest } from '../../middleware/rbac';

function createMockRequest(overrides: Partial<AuthenticatedRequest> = {}): Partial<AuthenticatedRequest> {
  return {
    method: 'GET',
    params: {},
    query: {},
    user: { userId: 'user-1', role: 'Engineering_Manager', teamId: 'TeamAlpha', functionId: 1 },
    ...overrides,
  };
}

function createMockResponse() {
  const result = { statusCode: null as number | null, body: null as unknown };
  const res = {
    status(code: number) {
      result.statusCode = code;
      return res;
    },
    json(data: unknown) {
      result.body = data;
      return res;
    },
  } as unknown as Response;
  return { res, result };
}

describe('Data Scope Middleware', () => {
  describe('Read Operations', () => {
    it('should allow Engineering_Manager to read own team data', () => {
      const req = createMockRequest({
        method: 'GET',
        query: { team: 'TeamAlpha' },
        user: { userId: 'user-em-001', role: 'Engineering_Manager', teamId: 'TeamAlpha', functionId: 1 },
      });
      const { res } = createMockResponse();
      let nextCalled = false;

      const middleware = dataScopeMiddleware();
      middleware(req as AuthenticatedRequest, res, () => { nextCalled = true; });

      expect(nextCalled).toBe(true);
      expect((req as Partial<DataScopedRequest>).dataScope).toEqual({
        type: 'single_team',
        teamId: 'TeamAlpha',
      });
    });

    it('should deny Engineering_Manager from reading another team\'s data', () => {
      const req = createMockRequest({
        method: 'GET',
        query: { team: 'TeamBeta' },
        user: { userId: 'user-em-001', role: 'Engineering_Manager', teamId: 'TeamAlpha', functionId: 1 },
      });
      const { res, result } = createMockResponse();

      const middleware = dataScopeMiddleware();
      middleware(req as AuthenticatedRequest, res, () => { throw new Error('next() should not be called'); });

      expect(result.statusCode).toBe(403);
      expect(result.body).toEqual({
        error: 'Access denied. You do not have permission to access this team\'s data.',
      });
    });

    it('should allow Leadership to read any team data', () => {
      const req = createMockRequest({
        method: 'GET',
        query: { team: 'TeamBeta' },
        user: { userId: 'user-lead-001', role: 'Leadership', teamId: null, functionId: null },
      });
      const { res } = createMockResponse();
      let nextCalled = false;

      const middleware = dataScopeMiddleware();
      middleware(req as AuthenticatedRequest, res, () => { nextCalled = true; });

      expect(nextCalled).toBe(true);
      expect((req as Partial<DataScopedRequest>).dataScope).toEqual({
        type: 'all_teams',
        teamId: null,
      });
    });

    it('should allow Super_Admin to read any team data', () => {
      const req = createMockRequest({
        method: 'GET',
        query: { team: 'TeamGamma' },
        user: { userId: 'user-sa-001', role: 'Super_Admin', teamId: null, functionId: null },
      });
      const { res } = createMockResponse();
      let nextCalled = false;

      const middleware = dataScopeMiddleware();
      middleware(req as AuthenticatedRequest, res, () => { nextCalled = true; });

      expect(nextCalled).toBe(true);
      expect((req as Partial<DataScopedRequest>).dataScope).toEqual({
        type: 'all_teams',
        teamId: null,
      });
    });

    it('should allow request when no target team is specified (for list endpoints)', () => {
      const req = createMockRequest({
        method: 'GET',
        query: {},
        user: { userId: 'user-em-001', role: 'Engineering_Manager', teamId: 'TeamAlpha', functionId: 1 },
      });
      const { res } = createMockResponse();
      let nextCalled = false;

      const middleware = dataScopeMiddleware();
      middleware(req as AuthenticatedRequest, res, () => { nextCalled = true; });

      expect(nextCalled).toBe(true);
      expect((req as Partial<DataScopedRequest>).dataScope).toEqual({
        type: 'single_team',
        teamId: 'TeamAlpha',
      });
    });

    it('should extract team from route params', () => {
      const req = createMockRequest({
        method: 'GET',
        params: { teamId: 'TeamBeta' },
        user: { userId: 'user-em-001', role: 'Engineering_Manager', teamId: 'TeamAlpha', functionId: 1 },
      });
      const { res, result } = createMockResponse();

      const middleware = dataScopeMiddleware();
      middleware(req as AuthenticatedRequest, res, () => { throw new Error('next() should not be called'); });

      expect(result.statusCode).toBe(403);
      expect(result.body).toEqual({
        error: 'Access denied. You do not have permission to access this team\'s data.',
      });
    });
  });

  describe('Write Operations', () => {
    it('should allow Engineering_Manager to write to own team', () => {
      const req = createMockRequest({
        method: 'POST',
        query: { team: 'TeamAlpha' },
        user: { userId: 'user-em-001', role: 'Engineering_Manager', teamId: 'TeamAlpha', functionId: 1 },
      });
      const { res } = createMockResponse();
      let nextCalled = false;

      const middleware = dataScopeMiddleware();
      middleware(req as AuthenticatedRequest, res, () => { nextCalled = true; });

      expect(nextCalled).toBe(true);
    });

    it('should deny Engineering_Manager from writing to another team', () => {
      const req = createMockRequest({
        method: 'POST',
        query: { team: 'TeamBeta' },
        user: { userId: 'user-em-001', role: 'Engineering_Manager', teamId: 'TeamAlpha', functionId: 1 },
      });
      const { res, result } = createMockResponse();

      const middleware = dataScopeMiddleware();
      middleware(req as AuthenticatedRequest, res, () => { throw new Error('next() should not be called'); });

      expect(result.statusCode).toBe(403);
      expect(result.body).toEqual({
        error: 'Access denied. You do not have permission to access this team\'s data.',
      });
    });

    it('should deny Leadership from all write operations', () => {
      const req = createMockRequest({
        method: 'POST',
        query: { team: 'TeamAlpha' },
        user: { userId: 'user-lead-001', role: 'Leadership', teamId: null, functionId: null },
      });
      const { res, result } = createMockResponse();

      const middleware = dataScopeMiddleware();
      middleware(req as AuthenticatedRequest, res, () => { throw new Error('next() should not be called'); });

      expect(result.statusCode).toBe(403);
      expect(result.body).toEqual({
        error: 'Forbidden. Your role does not permit this operation.',
      });
    });

    it('should deny Leadership from write even without target team', () => {
      const req = createMockRequest({
        method: 'PUT',
        query: {},
        user: { userId: 'user-lead-001', role: 'Leadership', teamId: null, functionId: null },
      });
      const { res, result } = createMockResponse();

      const middleware = dataScopeMiddleware();
      middleware(req as AuthenticatedRequest, res, () => { throw new Error('next() should not be called'); });

      expect(result.statusCode).toBe(403);
      expect(result.body).toEqual({
        error: 'Forbidden. Your role does not permit this operation.',
      });
    });

    it('should allow Super_Admin to write to any team', () => {
      const req = createMockRequest({
        method: 'POST',
        query: { team: 'TeamBeta' },
        user: { userId: 'user-sa-001', role: 'Super_Admin', teamId: null, functionId: null },
      });
      const { res } = createMockResponse();
      let nextCalled = false;

      const middleware = dataScopeMiddleware();
      middleware(req as AuthenticatedRequest, res, () => { nextCalled = true; });

      expect(nextCalled).toBe(true);
    });

    it('should detect PUT as a write operation', () => {
      const req = createMockRequest({
        method: 'PUT',
        query: { team: 'TeamAlpha' },
        user: { userId: 'user-lead-001', role: 'Leadership', teamId: null, functionId: null },
      });
      const { res, result } = createMockResponse();

      const middleware = dataScopeMiddleware();
      middleware(req as AuthenticatedRequest, res, () => { throw new Error('next() should not be called'); });

      expect(result.statusCode).toBe(403);
    });

    it('should detect PATCH as a write operation', () => {
      const req = createMockRequest({
        method: 'PATCH',
        query: { team: 'TeamAlpha' },
        user: { userId: 'user-lead-001', role: 'Leadership', teamId: null, functionId: null },
      });
      const { res, result } = createMockResponse();

      const middleware = dataScopeMiddleware();
      middleware(req as AuthenticatedRequest, res, () => { throw new Error('next() should not be called'); });

      expect(result.statusCode).toBe(403);
    });
  });

  describe('Delete Operations', () => {
    it('should deny Engineering_Manager from deleting records', () => {
      const req = createMockRequest({
        method: 'DELETE',
        user: { userId: 'user-em-001', role: 'Engineering_Manager', teamId: 'TeamAlpha', functionId: 1 },
      });
      const { res, result } = createMockResponse();

      const middleware = dataScopeMiddleware();
      middleware(req as AuthenticatedRequest, res, () => { throw new Error('next() should not be called'); });

      expect(result.statusCode).toBe(403);
      expect(result.body).toEqual({
        error: 'Forbidden. Engineering Managers cannot delete records.',
      });
    });

    it('should deny Leadership from deleting records', () => {
      const req = createMockRequest({
        method: 'DELETE',
        user: { userId: 'user-lead-001', role: 'Leadership', teamId: null, functionId: null },
      });
      const { res, result } = createMockResponse();

      const middleware = dataScopeMiddleware();
      middleware(req as AuthenticatedRequest, res, () => { throw new Error('next() should not be called'); });

      expect(result.statusCode).toBe(403);
      expect(result.body).toEqual({
        error: 'Forbidden. Your role does not permit this operation.',
      });
    });

    it('should allow Super_Admin to delete records', () => {
      const req = createMockRequest({
        method: 'DELETE',
        user: { userId: 'user-sa-001', role: 'Super_Admin', teamId: null, functionId: null },
      });
      const { res } = createMockResponse();
      let nextCalled = false;

      const middleware = dataScopeMiddleware();
      middleware(req as AuthenticatedRequest, res, () => { nextCalled = true; });

      expect(nextCalled).toBe(true);
    });
  });

  describe('Operation Type Override', () => {
    it('should use operationType override instead of HTTP method detection', () => {
      const req = createMockRequest({
        method: 'GET',
        query: { team: 'TeamAlpha' },
        user: { userId: 'user-lead-001', role: 'Leadership', teamId: null, functionId: null },
      });
      const { res, result } = createMockResponse();

      // Override GET as a write operation
      const middleware = dataScopeMiddleware({ operationType: 'write' });
      middleware(req as AuthenticatedRequest, res, () => { throw new Error('next() should not be called'); });

      expect(result.statusCode).toBe(403);
      expect(result.body).toEqual({
        error: 'Forbidden. Your role does not permit this operation.',
      });
    });
  });

  describe('Convenience Middleware', () => {
    it('readScopeMiddleware should enforce read permissions', () => {
      const req = createMockRequest({
        method: 'GET',
        query: { team: 'TeamBeta' },
        user: { userId: 'user-em-001', role: 'Engineering_Manager', teamId: 'TeamAlpha', functionId: 1 },
      });
      const { res, result } = createMockResponse();

      readScopeMiddleware(req as AuthenticatedRequest, res, () => { throw new Error('next() should not be called'); });

      expect(result.statusCode).toBe(403);
    });

    it('writeScopeMiddleware should enforce write permissions', () => {
      const req = createMockRequest({
        method: 'POST',
        query: { team: 'TeamAlpha' },
        user: { userId: 'user-lead-001', role: 'Leadership', teamId: null, functionId: null },
      });
      const { res, result } = createMockResponse();

      writeScopeMiddleware(req as AuthenticatedRequest, res, () => { throw new Error('next() should not be called'); });

      expect(result.statusCode).toBe(403);
    });

    it('deleteScopeMiddleware should enforce delete permissions', () => {
      const req = createMockRequest({
        method: 'DELETE',
        user: { userId: 'user-em-001', role: 'Engineering_Manager', teamId: 'TeamAlpha', functionId: 1 },
      });
      const { res, result } = createMockResponse();

      deleteScopeMiddleware(req as AuthenticatedRequest, res, () => { throw new Error('next() should not be called'); });

      expect(result.statusCode).toBe(403);
    });
  });

  describe('User Context Attachment', () => {
    it('should attach userContext to the request', () => {
      const req = createMockRequest({
        method: 'GET',
        user: { userId: 'user-em-001', role: 'Engineering_Manager', teamId: 'TeamAlpha', functionId: 1 },
      });
      const { res } = createMockResponse();

      const middleware = dataScopeMiddleware();
      middleware(req as AuthenticatedRequest, res, () => {});

      expect((req as Partial<DataScopedRequest>).userContext).toEqual({
        userId: 'user-em-001',
        role: 'Engineering_Manager',
        teamId: 'TeamAlpha',
      });
    });

    it('should return 401 when user context is missing', () => {
      const req = { method: 'GET', params: {}, query: {} } as unknown as AuthenticatedRequest;
      const { res, result } = createMockResponse();

      const middleware = dataScopeMiddleware();
      middleware(req, res, () => { throw new Error('next() should not be called'); });

      expect(result.statusCode).toBe(401);
      expect(result.body).toEqual({ error: 'Authentication required.' });
    });
  });

  describe('Response Format Consistency', () => {
    it('should return 403 with JSON body containing error string for team-scope violation', () => {
      const req = createMockRequest({
        method: 'GET',
        query: { team: 'TeamBeta' },
        user: { userId: 'user-em-001', role: 'Engineering_Manager', teamId: 'TeamAlpha', functionId: 1 },
      });
      const { res, result } = createMockResponse();

      const middleware = dataScopeMiddleware();
      middleware(req as AuthenticatedRequest, res, () => {});

      expect(result.statusCode).toBe(403);
      expect(typeof (result.body as { error: string }).error).toBe('string');
      expect((result.body as { error: string }).error.length).toBeGreaterThan(0);
    });

    it('should return 403 with JSON body containing error string for write denial', () => {
      const req = createMockRequest({
        method: 'POST',
        query: { team: 'TeamAlpha' },
        user: { userId: 'user-lead-001', role: 'Leadership', teamId: null, functionId: null },
      });
      const { res, result } = createMockResponse();

      const middleware = dataScopeMiddleware();
      middleware(req as AuthenticatedRequest, res, () => {});

      expect(result.statusCode).toBe(403);
      expect(typeof (result.body as { error: string }).error).toBe('string');
      expect((result.body as { error: string }).error.length).toBeGreaterThan(0);
    });
  });
});
