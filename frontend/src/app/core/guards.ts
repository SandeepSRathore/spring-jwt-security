import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { TokenStore } from './token-store';

export const signedInGuard: CanActivateFn = () =>
  inject(TokenStore).signedIn() || inject(Router).createUrlTree(['/login']);

export const signedOutGuard: CanActivateFn = () =>
  !inject(TokenStore).signedIn() || inject(Router).createUrlTree(['/account']);

/** UI convenience only: the server enforces ROLE_ADMIN regardless of what the client shows. */
export const adminGuard: CanActivateFn = () =>
  inject(TokenStore).isAdmin() || inject(Router).createUrlTree(['/account']);
