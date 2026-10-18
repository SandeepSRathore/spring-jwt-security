import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { AuthService } from './core/auth.service';
import { TokenStore } from './core/token-store';
import { RequestLogPanel } from './rail/request-log-panel';
import { TokenPass } from './rail/token-pass';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, TokenPass, RequestLogPanel],
  template: `
    <a class="skip" href="#main">Skip to content</a>
    <header class="topbar">
      <div class="brand">
        <span class="brand-name">Token bench</span>
        <span class="brand-target">testing the API on localhost:8080</span>
      </div>
      @if (store.signedIn()) {
        <nav class="nav" aria-label="Main">
          <a routerLink="/account" routerLinkActive="active" ariaCurrentWhenActive="page">Account</a>
          <a routerLink="/sessions" routerLinkActive="active" ariaCurrentWhenActive="page">Devices</a>
          @if (store.isAdmin()) {
            <a routerLink="/admin" routerLinkActive="active" ariaCurrentWhenActive="page">Users</a>
          }
        </nav>
        <div class="who">
          <span class="who-email">{{ store.email() }}</span>
          <button type="button" class="btn btn-quiet btn-small" (click)="auth.logout()">Sign out</button>
        </div>
      }
    </header>

    <div class="layout">
      <main id="main" class="main" tabindex="-1">
        <router-outlet />
      </main>
      <aside class="rail" aria-label="Token inspector">
        <app-token-pass />
        <app-request-log-panel />
      </aside>
    </div>
  `,
  styles: `
    :host {
      display: block;
      min-height: 100vh;
    }

    .skip {
      position: absolute;
      left: 1rem;
      top: -3rem;
      padding: 0.5rem 1rem;
      background: var(--ink);
      color: #fff;
      z-index: 10;
      border-radius: var(--radius-control);
    }

    .skip:focus {
      top: 0.75rem;
    }

    .topbar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.75rem 2rem;
      padding: 0.9rem clamp(1rem, 3vw, 2.5rem);
      border-bottom: 1px solid var(--rule);
      background: var(--sheet);
    }

    .brand {
      display: grid;
      line-height: 1.15;
    }

    .brand-name {
      font-weight: 700;
      font-size: var(--step-1);
      letter-spacing: -0.02em;
      color: var(--passport);
    }

    .brand-target {
      font-size: var(--step--1);
      color: var(--ink-muted);
    }

    .nav {
      display: flex;
      flex-wrap: wrap;
      gap: 0.25rem 1.25rem;
    }

    .nav a {
      padding: 0.35rem 0;
      color: var(--ink-muted);
      font-weight: 500;
      text-decoration: none;
      border-bottom: 2px solid transparent;
    }

    .nav a:hover {
      color: var(--ink);
    }

    .nav a.active {
      color: var(--ink);
      border-bottom-color: var(--passport);
    }

    .who {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-left: auto;
      min-width: 0;
    }

    .who-email {
      font-size: var(--step--1);
      color: var(--ink-muted);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .layout {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(20rem, 27rem);
      align-items: start;
    }

    .main {
      padding: clamp(1.5rem, 4vw, 3rem) clamp(1rem, 3vw, 2.5rem) 4rem;
      outline: none;
    }

    .rail {
      position: sticky;
      top: 0;
      display: grid;
      gap: 1.5rem;
      align-content: start;
      max-height: 100vh;
      overflow-y: auto;
      padding: 1.5rem clamp(1rem, 2vw, 1.5rem) 2rem;
      background: var(--paper-deep);
      border-left: 1px solid var(--rule);
      min-height: calc(100vh - 4rem);
    }

    @media (max-width: 960px) {
      .layout {
        grid-template-columns: minmax(0, 1fr);
      }

      .rail {
        position: static;
        max-height: none;
        min-height: 0;
        border-left: 0;
        border-top: 1px solid var(--rule);
      }
    }
  `,
})
export class App {
  protected readonly store = inject(TokenStore);
  protected readonly auth = inject(AuthService);
}
