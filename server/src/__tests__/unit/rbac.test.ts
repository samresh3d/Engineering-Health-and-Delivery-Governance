import { describe, it, expect } from 'vitest';
import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { rbacMiddleware, AuthenticatedRequest, JWT_SECRET, matchRoute, getAllowedRoles } from '../../middleware/rbac';

function createMockRequest(overrides: Partial<Request> = {}): Partial<Request> {
  return {
    path: '/api/dashboard/kpis',
    headers: {},
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

function generateToken(payload: object, secret: string = JWT_SECRET, options: jwt.SignOptions = {}): string {
  return jwt.sign(payload, secret, { expiresIn: '1h', ...options });
}

describe('RBAC Middleware', () => {
  describe('Authentication - Token Verification', () => {
    it('should return 401 when no Authorization header is present', () => {
      const req = createMockRequest({ headers: {} });
      const { res, result } = createMockResponse();
      const next = () => { throw new Error('next() should not be called'); };

      rbacMiddleware(req as Request, res, next);

      expect(result.statusCode).toBe(401);
      expect(result.body).toHaveProperty('error');
    });

    it('should return 401 when Authorization header does not start with Bearer', () => {
      const req = createMockRequest({ headers: { authorization: 'Basic abc123' } });
      const { res, result } = createMockResponse();
      const next = () => { throw new Error('next() should not be called'); };

      rbacMiddleware(req as Request, res, next);

      expect(result.statusCode).toBe(401);
      expect(result.body).toHaveProperty('error');
    });

    it('should return 401 when token is empty after Bearer prefix', () => {
      const req = createMockRequest({ headers: { authorization: 'Bearer ' } });
      const { res, result } = createMockResponse();
      const next = () => { throw new Error('next() should not be called'); };

      rbacMiddleware(req as Request, res, next);

      expect(result.statusCode).toBe(401);
    });

    it('should return 401 when token is invalid/malformed', () => {
      const req = createMockRequest({ headers: { authorization: 'Bearer invalid.token.here' } });
      const { res, result } = createMockResponse();
      const next = () => { throw new Error('next() should not be called'); };

      rbacMiddleware(req as Request, res, next);

      expect(result.statusCode).toBe(401);
      expect(result.body).toHaveProperty('error');
    });

    it('should return 401 when token is signed with wrong secret', () => {
      const token = generateToken({ userId: 'user-1', role: 'Admin' }, 'wrong-secret');
      const req = createMockRequest({ headers: { authorization: `Bearer ${token}` } });
      const { res, result } = createMockResponse();
      const next = () => { throw new Error('next() should not be called'); };

      rbacMiddleware(req as Request, res, next);

      expect(result.statusCode).toBe(401);
    });

    it('should return 401 when token is expired', () => {
      const token = generateToken({ userId: 'user-1', role: 'Admin' }, JWT_SECRET, { expiresIn: '-1s' });
      const req = createMockRequest({ headers: { authorization: `Bearer ${token}` } });
      const { res, result } = createMockResponse();
      const next = () => { throw new Error('next() should not be called'); };

      rbacMiddleware(req as Request, res, next);

      expect(result.statusCode).toBe(401);
      expect((result.body as { error: string }).error).toContain('expired');
    });

    it('should pass valid token and attach user context to request', () => {
      const token = generateToken({ userId: 'user-admin-001', role: 'Admin' });
      const req = createMockRequest({
        path: '/api/dashboard/kpis',
        headers: { authorization: `Bearer ${token}` },
      });
      const { res } = createMockResponse();
      let nextCalled = false;
      const next = () => { nextCalled = true; };

      rbacMiddleware(req as Request, res, next);

      expect(nextCalled).toBe(true);
      expect((req as Partial<AuthenticatedRequest>).user).toEqual({
        userId: 'user-admin-001',
        role: 'Admin',
      });
    });
  });

  describe('Authorization - Route Permissions', () => {
    it('should allow Admin to access /api/upload', () => {
      const token = generateToken({ userId: 'user-admin-001', role: 'Admin' });
      const req = createMockRequest({
        path: '/api/upload',
        headers: { authorization: `Bearer ${token}` },
      });
      const { res } = createMockResponse();
      let nextCalled = false;
      const next = () => { nextCalled = true; };

      rbacMiddleware(req as Request, res, next);

      expect(nextCalled).toBe(true);
    });

    it('should allow Engineering_Manager to access /api/upload', () => {
      const token = generateToken({ userId: 'user-em-001', role: 'Engineering_Manager' });
      const req = createMockRequest({
        path: '/api/upload',
        headers: { authorization: `Bearer ${token}` },
      });
      const { res } = createMockResponse();
      let nextCalled = false;
      const next = () => { nextCalled = true; };

      rbacMiddleware(req as Request, res, next);

      expect(nextCalled).toBe(true);
    });

    it('should deny Delivery_Manager access to /api/upload', () => {
      const token = generateToken({ userId: 'user-dm-001', role: 'Delivery_Manager' });
      const req = createMockRequest({
        path: '/api/upload',
        headers: { authorization: `Bearer ${token}` },
      });
      const { res, result } = createMockResponse();
      const next = () => { throw new Error('next() should not be called'); };

      rbacMiddleware(req as Request, res, next);

      expect(result.statusCode).toBe(403);
      expect(result.body).toHaveProperty('error');
    });

    it('should deny Leadership access to /api/upload', () => {
      const token = generateToken({ userId: 'user-lead-001', role: 'Leadership' });
      const req = createMockRequest({
        path: '/api/upload',
        headers: { authorization: `Bearer ${token}` },
      });
      const { res, result } = createMockResponse();
      const next = () => { throw new Error('next() should not be called'); };

      rbacMiddleware(req as Request, res, next);

      expect(result.statusCode).toBe(403);
    });

    it('should allow all roles to access /api/dashboard/* routes', () => {
      const roles = ['Admin', 'Engineering_Manager', 'Delivery_Manager', 'Leadership'];
      for (const role of roles) {
        const token = generateToken({ userId: `user-${role}`, role });
        const req = createMockRequest({
          path: '/api/dashboard/kpis',
          headers: { authorization: `Bearer ${token}` },
        });
        const { res } = createMockResponse();
        let nextCalled = false;
        const next = () => { nextCalled = true; };

        rbacMiddleware(req as Request, res, next);

        expect(nextCalled).toBe(true);
      }
    });

    it('should only allow Admin to access /api/config/* routes', () => {
      // Admin should have access
      const adminToken = generateToken({ userId: 'user-admin-001', role: 'Admin' });
      const adminReq = createMockRequest({
        path: '/api/config/thresholds',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      const { res: adminRes } = createMockResponse();
      let adminNextCalled = false;
      rbacMiddleware(adminReq as Request, adminRes, () => { adminNextCalled = true; });
      expect(adminNextCalled).toBe(true);

      // Other roles should be denied
      const otherRoles = ['Engineering_Manager', 'Delivery_Manager', 'Leadership'];
      for (const role of otherRoles) {
        const token = generateToken({ userId: `user-${role}`, role });
        const req = createMockRequest({
          path: '/api/config/thresholds',
          headers: { authorization: `Bearer ${token}` },
        });
        const { res, result } = createMockResponse();
        rbacMiddleware(req as Request, res, () => { throw new Error('should not call next'); });
        expect(result.statusCode).toBe(403);
      }
    });

    it('should allow Engineering_Manager, Delivery_Manager, Leadership to access /api/reports/*', () => {
      const allowedRoles = ['Engineering_Manager', 'Delivery_Manager', 'Leadership'];
      for (const role of allowedRoles) {
        const token = generateToken({ userId: `user-${role}`, role });
        const req = createMockRequest({
          path: '/api/reports/summary',
          headers: { authorization: `Bearer ${token}` },
        });
        const { res } = createMockResponse();
        let nextCalled = false;
        rbacMiddleware(req as Request, res, () => { nextCalled = true; });
        expect(nextCalled).toBe(true);
      }

      // Admin should be denied from /api/reports/*
      const adminToken = generateToken({ userId: 'user-admin-001', role: 'Admin' });
      const adminReq = createMockRequest({
        path: '/api/reports/summary',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      const { res: adminRes, result: adminResult } = createMockResponse();
      rbacMiddleware(adminReq as Request, adminRes, () => { throw new Error('should not call next'); });
      expect(adminResult.statusCode).toBe(403);
    });

    it('should allow all roles to access /api/filters/* routes', () => {
      const roles = ['Admin', 'Engineering_Manager', 'Delivery_Manager', 'Leadership'];
      for (const role of roles) {
        const token = generateToken({ userId: `user-${role}`, role });
        const req = createMockRequest({
          path: '/api/filters/portfolios',
          headers: { authorization: `Bearer ${token}` },
        });
        const { res } = createMockResponse();
        let nextCalled = false;
        rbacMiddleware(req as Request, res, () => { nextCalled = true; });
        expect(nextCalled).toBe(true);
      }
    });
  });

  describe('Auth Routes Bypass', () => {
    it('should allow /api/auth/mock-users without any token', () => {
      const req = createMockRequest({ path: '/api/auth/mock-users', headers: {} });
      const { res } = createMockResponse();
      let nextCalled = false;
      rbacMiddleware(req as Request, res, () => { nextCalled = true; });
      expect(nextCalled).toBe(true);
    });

    it('should allow /api/auth/me without any token', () => {
      const req = createMockRequest({ path: '/api/auth/me', headers: {} });
      const { res } = createMockResponse();
      let nextCalled = false;
      rbacMiddleware(req as Request, res, () => { nextCalled = true; });
      expect(nextCalled).toBe(true);
    });
  });

  describe('Helper Functions', () => {
    it('matchRoute should support exact matches', () => {
      expect(matchRoute('/api/upload', '/api/upload')).toBe(true);
      expect(matchRoute('/api/upload', '/api/uploads')).toBe(false);
    });

    it('matchRoute should support wildcard patterns', () => {
      expect(matchRoute('/api/dashboard/kpis', '/api/dashboard/*')).toBe(true);
      expect(matchRoute('/api/dashboard/trends', '/api/dashboard/*')).toBe(true);
      expect(matchRoute('/api/dashboard', '/api/dashboard/*')).toBe(true);
      expect(matchRoute('/api/dashboardx', '/api/dashboard/*')).toBe(false);
    });

    it('getAllowedRoles should return correct roles for known routes', () => {
      expect(getAllowedRoles('/api/upload')).toEqual(['Admin', 'Engineering_Manager']);
      expect(getAllowedRoles('/api/config/thresholds')).toEqual(['Admin']);
      expect(getAllowedRoles('/api/dashboard/kpis')).toEqual(['Admin', 'Engineering_Manager', 'Delivery_Manager', 'Leadership']);
    });

    it('getAllowedRoles should return null for unknown routes', () => {
      expect(getAllowedRoles('/api/unknown')).toBeNull();
    });
  });
});
