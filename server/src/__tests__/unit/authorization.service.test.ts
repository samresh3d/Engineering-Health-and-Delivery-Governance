import { describe, it, expect } from 'vitest';
import { AuthorizationService } from '../../services/authorization.service';
import type { UserContext } from '../../types/rbac-analytics.types';

describe('AuthorizationService', () => {
  const service = new AuthorizationService();

  describe('canManageDivisions', () => {
    it('should permit Super_Admin for any team', () => {
      const user: UserContext = { userId: 'sa-1', role: 'Super_Admin', teamId: null };
      const result = service.canManageDivisions(user, 'TeamAlpha');

      expect(result.permitted).toBe(true);
      expect(result.scopedTeam).toBeNull();
      expect(result.errorMessage).toBeUndefined();
    });

    it('should permit Super_Admin for a different team', () => {
      const user: UserContext = { userId: 'sa-1', role: 'Super_Admin', teamId: null };
      const result = service.canManageDivisions(user, 'TeamBeta');

      expect(result.permitted).toBe(true);
      expect(result.scopedTeam).toBeNull();
    });

    it('should permit Engineering_Manager for own team', () => {
      const user: UserContext = { userId: 'em-1', role: 'Engineering_Manager', teamId: 'TeamAlpha' };
      const result = service.canManageDivisions(user, 'TeamAlpha');

      expect(result.permitted).toBe(true);
      expect(result.scopedTeam).toBe('TeamAlpha');
      expect(result.errorMessage).toBeUndefined();
    });

    it('should deny Engineering_Manager for a different team', () => {
      const user: UserContext = { userId: 'em-1', role: 'Engineering_Manager', teamId: 'TeamAlpha' };
      const result = service.canManageDivisions(user, 'TeamBeta');

      expect(result.permitted).toBe(false);
      expect(result.scopedTeam).toBeNull();
      expect(result.errorMessage).toBeDefined();
    });

    it('should deny Engineering_Manager with null teamId', () => {
      const user: UserContext = { userId: 'em-2', role: 'Engineering_Manager', teamId: null };
      const result = service.canManageDivisions(user, 'TeamAlpha');

      expect(result.permitted).toBe(false);
      expect(result.scopedTeam).toBeNull();
      expect(result.errorMessage).toBeDefined();
    });

    it('should deny Leadership role (read-only)', () => {
      const user: UserContext = { userId: 'lead-1', role: 'Leadership', teamId: null };
      const result = service.canManageDivisions(user, 'TeamAlpha');

      expect(result.permitted).toBe(false);
      expect(result.scopedTeam).toBeNull();
      expect(result.errorMessage).toBeDefined();
    });

    it('should deny Admin role', () => {
      const user: UserContext = { userId: 'admin-1', role: 'Admin', teamId: null };
      const result = service.canManageDivisions(user, 'TeamAlpha');

      expect(result.permitted).toBe(false);
      expect(result.scopedTeam).toBeNull();
      expect(result.errorMessage).toBeDefined();
    });

    it('should deny Delivery_Manager role', () => {
      const user: UserContext = { userId: 'dm-1', role: 'Delivery_Manager', teamId: 'TeamAlpha' };
      const result = service.canManageDivisions(user, 'TeamAlpha');

      expect(result.permitted).toBe(false);
      expect(result.scopedTeam).toBeNull();
      expect(result.errorMessage).toBeDefined();
    });
  });
});
