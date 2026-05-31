import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';

/**
 * Attach one or more permission keys to a controller or route handler.
 * The PermissionsGuard will verify the requesting user holds every listed key.
 *
 * Usage:
 *   @Permission('old-gold.create')
 *   @Permission('old-gold.approve', 'old-gold.reject')  // user must have BOTH
 */
export const Permission = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
