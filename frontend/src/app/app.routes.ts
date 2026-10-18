import { Routes } from '@angular/router';

import { adminGuard, signedInGuard, signedOutGuard } from './core/guards';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [signedOutGuard],
    title: 'Sign in | Token bench',
    loadComponent: () => import('./pages/login.page').then((m) => m.LoginPage),
  },
  {
    path: '',
    canActivate: [signedInGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'account' },
      {
        path: 'account',
        title: 'Account | Token bench',
        loadComponent: () => import('./pages/account.page').then((m) => m.AccountPage),
      },
      {
        path: 'sessions',
        title: 'Devices | Token bench',
        loadComponent: () => import('./pages/sessions.page').then((m) => m.SessionsPage),
      },
      {
        path: 'admin',
        canActivate: [adminGuard],
        title: 'Users | Token bench',
        loadComponent: () => import('./pages/admin.page').then((m) => m.AdminPage),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
