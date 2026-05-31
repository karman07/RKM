import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';

/**
 * Default permissions granted to built-in roles that don't go through the
 * custom-role system.  Add keys here when a new module ships defaults for
 * manager / cashier without requiring an admin to configure a custom role.
 *
 * Admins always pass regardless of this map.
 */
const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
  manager: [
    'old-gold.view-branch',
    'old-gold.create',
    'old-gold.edit',
    'old-gold.submit',
  ],
  cashier: [
    'old-gold.view-branch',
  ],
};

/**
 * PermissionsGuard — checks action-level permission keys.
 *
 * Resolution order:
 *   1. No @Permission() decorator on the route → allow (guard is a no-op).
 *   2. role === 'admin'                         → always allow.
 *   3. role === 'custom'                        → check req.user.permissions[]
 *      (populated from the JWT by JwtStrategy after auth.service includes
 *      the custom role's sidebar_permissions in the token payload).
 *   4. role === 'manager' | 'cashier'           → check DEFAULT_ROLE_PERMISSIONS.
 *
 * Multiple keys on a single @Permission() call require the user to hold ALL
 * of them (AND logic).  Use separate decorators for OR logic if needed.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required || required.length === 0) return true;

    const { user } = context.switchToHttp().getRequest();
    if (!user) return false;

    if (user.role === 'admin') return true;

    const effective: string[] =
      user.role === 'custom'
        ? (user.permissions ?? [])
        : (DEFAULT_ROLE_PERMISSIONS[user.role] ?? []);

    const missing = required.filter(p => !effective.includes(p));
    if (missing.length > 0) {
      throw new ForbiddenException(
        `Missing permission${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`,
      );
    }
    return true;
  }
}
