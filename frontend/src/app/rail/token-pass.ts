import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';

import { AuthService } from '../core/auth.service';
import { Clock } from '../core/clock';
import { RelativePipe, formatDuration } from '../core/format';
import { TokenStore } from '../core/token-store';

type PassState = 'valid' | 'low' | 'expired';

/**
 * The access token drawn as a pass: its three segments, a bar that drains towards expiry,
 * and the decoded claims. When the token runs out it gets stamped.
 */
@Component({
  selector: 'app-token-pass',
  imports: [DatePipe, RelativePipe],
  template: `
    <section class="pass" [class]="'pass state-' + (claims() ? state() : 'none')" aria-labelledby="pass-title">
      <div class="pass-head">
        <h2 id="pass-title">Access token</h2>
        @if (claims()) {
          <span class="pass-status" role="status">{{ statusText() }}</span>
        }
      </div>

      @if (store.decoded(); as jwt) {
        @if (state() === 'expired') {
          <div class="stamp" aria-hidden="true">Expired</div>
        }

        <div class="life" role="meter" aria-label="Access token lifetime remaining"
             aria-valuemin="0" aria-valuemax="100" [attr.aria-valuenow]="percentLeft()"
             [attr.aria-valuetext]="statusText()">
          <div class="life-fill" [style.width.%]="percentLeft()"></div>
        </div>

        <p class="token" [class.clamped]="!expanded()">
          <span class="seg seg-header">{{ jwt.segments[0] }}</span>.<span class="seg seg-payload">{{ jwt.segments[1] }}</span>.<span class="seg seg-signature">{{ jwt.segments[2] }}</span>
        </p>
        <div class="token-actions">
          <button type="button" class="link-btn" (click)="expanded.set(!expanded())" [attr.aria-expanded]="expanded()">
            {{ expanded() ? 'Show less' : 'Show the whole token' }}
          </button>
          <button type="button" class="link-btn" (click)="copy(store.accessToken())">{{ copied() ? 'Copied' : 'Copy' }}</button>
        </div>

        <dl class="claims">
          <div><dt><span class="key key-header"></span>Algorithm</dt><dd>{{ jwt.header['alg'] }}, typ {{ jwt.header['typ'] }}</dd></div>
          <div><dt><span class="key key-payload"></span>User id</dt><dd>{{ jwt.claims.sub }}</dd></div>
          <div><dt>Roles</dt><dd>{{ jwt.claims.roles.join(', ') }}</dd></div>
          <div><dt>Session</dt><dd class="data" [title]="jwt.claims.sid">{{ jwt.claims.sid.slice(0, 8) }}</dd></div>
          <div><dt>Token id</dt><dd class="data" [title]="jwt.claims.jti">{{ jwt.claims.jti.slice(0, 8) }}</dd></div>
          <div><dt>Issued</dt><dd>{{ jwt.claims.iat * 1000 | date: 'HH:mm:ss' }}</dd></div>
          <div><dt>Expires</dt><dd>{{ jwt.claims.exp * 1000 | date: 'HH:mm:ss' }}</dd></div>
          <div><dt><span class="key key-signature"></span>Signature</dt><dd>HMAC-SHA256, checked by the server only</dd></div>
        </dl>
      } @else {
        <p class="empty">No access token. Sign in to get one; it lives only in this tab’s memory.</p>
      }
    </section>

    <section class="refresh" aria-labelledby="refresh-title">
      <h2 id="refresh-title">Refresh token</h2>
      @if (store.refreshToken(); as refreshToken) {
        <p><span class="data">{{ refreshToken.slice(0, 10) }}…</span> expires {{ store.refreshExpiresAt() | relative: clock.now() }}</p>
        <p class="muted small">Opaque and single use. Each refresh swaps it for a new one.</p>
      } @else {
        <p class="muted small">None.</p>
      }
      <label class="toggle">
        <input type="checkbox" [checked]="auth.autoRefresh()" (change)="auth.autoRefresh.set(!auth.autoRefresh())" />
        Refresh automatically when the access token expires
      </label>
    </section>
  `,
  styles: `
    :host {
      display: grid;
      gap: 1.25rem;
    }

    .pass {
      position: relative;
      display: grid;
      gap: 0.9rem;
      padding: 1.1rem 1.1rem 1.2rem;
      background: var(--sheet);
      border: 1px solid var(--rule);
      border-top: 6px solid var(--passport);
      border-radius: 4px 4px 12px 12px;
      box-shadow: 0 1px 0 var(--rule), 0 10px 24px -18px rgb(26 32 39 / 0.45);
      overflow: hidden;
    }

    .pass.state-none {
      border-top-color: var(--rule-strong);
    }

    .pass-head {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 1rem;
    }

    .pass-status {
      font-size: var(--step--1);
      font-weight: 600;
      color: var(--valid);
      font-variant-numeric: tabular-nums;
    }

    .state-low .pass-status {
      color: var(--warn);
    }

    .state-expired .pass-status {
      color: var(--danger);
    }

    .life {
      height: 8px;
      border-radius: 4px;
      background: var(--paper-deep);
      overflow: hidden;
    }

    .life-fill {
      height: 100%;
      background: var(--valid);
      transition: width 1s linear, background-color 0.3s;
    }

    .state-low .life-fill {
      background: var(--warn);
    }

    .token {
      font-family: var(--font-data);
      font-size: 0.72rem;
      line-height: 1.55;
      word-break: break-all;
      color: var(--ink-muted);
    }

    .token.clamped {
      display: -webkit-box;
      -webkit-line-clamp: 4;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .seg-header {
      color: var(--passport);
    }

    .seg-payload {
      color: var(--steel);
    }

    .seg-signature {
      color: var(--valid);
    }

    .token-actions {
      display: flex;
      gap: 1rem;
      margin-top: -0.4rem;
    }

    .link-btn {
      padding: 0;
      border: 0;
      background: none;
      color: var(--steel);
      font: inherit;
      font-size: var(--step--1);
      font-weight: 500;
      text-decoration: underline;
      text-underline-offset: 0.18em;
      cursor: pointer;
    }

    .claims {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.6rem 1rem;
      margin: 0;
      padding-top: 0.9rem;
      border-top: 1px dashed var(--rule);
      font-size: var(--step--1);
    }

    .claims div {
      min-width: 0;
    }

    .claims dt {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      color: var(--ink-muted);
    }

    .claims dd {
      margin: 0;
      font-weight: 500;
      overflow-wrap: anywhere;
    }

    .key {
      width: 0.55rem;
      height: 0.55rem;
      border-radius: 2px;
    }

    .key-header {
      background: var(--passport);
    }

    .key-payload {
      background: var(--steel);
    }

    .key-signature {
      background: var(--valid);
    }

    .stamp {
      position: absolute;
      top: 3.4rem;
      right: 0.9rem;
      padding: 0.15rem 0.75rem;
      border: 3px double var(--danger);
      border-radius: 6px;
      color: var(--danger);
      font-size: 1.5rem;
      font-weight: 700;
      letter-spacing: 0.04em;
      transform: rotate(-9deg);
      background: rgb(251 252 250 / 0.85);
      animation: stamp 0.28s cubic-bezier(0.2, 0.9, 0.3, 1.3);
      pointer-events: none;
    }

    @keyframes stamp {
      from {
        opacity: 0;
        transform: rotate(-9deg) scale(1.6);
      }
    }

    .empty {
      color: var(--ink-muted);
    }

    .refresh {
      display: grid;
      gap: 0.4rem;
      padding: 0 0.15rem;
    }

    .small {
      font-size: var(--step--1);
    }

    .toggle {
      display: flex;
      gap: 0.6rem;
      align-items: flex-start;
      margin-top: 0.5rem;
      font-size: var(--step--1);
      font-weight: 500;
      cursor: pointer;
    }

    .toggle input {
      width: 1.05rem;
      height: 1.05rem;
      margin: 0.1rem 0 0;
      accent-color: var(--passport);
    }
  `,
})
export class TokenPass {
  protected readonly store = inject(TokenStore);
  protected readonly auth = inject(AuthService);
  protected readonly clock = inject(Clock);

  protected readonly expanded = signal(false);
  protected readonly copied = signal(false);

  protected readonly claims = computed(() => this.store.decoded()?.claims ?? null);
  private readonly remainingMs = computed(() => {
    const claims = this.claims();
    return claims ? claims.exp * 1000 - this.clock.now() : 0;
  });
  private readonly lifetimeMs = computed(() => {
    const claims = this.claims();
    return claims ? Math.max(1, (claims.exp - claims.iat) * 1000) : 1;
  });

  protected readonly percentLeft = computed(() =>
    Math.round(Math.min(1, Math.max(0, this.remainingMs() / this.lifetimeMs())) * 100),
  );
  protected readonly state = computed<PassState>(() => {
    if (this.remainingMs() <= 0) return 'expired';
    return this.percentLeft() <= 20 ? 'low' : 'valid';
  });
  protected readonly statusText = computed(() =>
    this.state() === 'expired'
      ? `Expired ${formatDuration(-this.remainingMs())} ago`
      : `${formatDuration(this.remainingMs())} left of ${formatDuration(this.lifetimeMs())}`,
  );

  protected async copy(value: string | null): Promise<void> {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 1500);
    } catch {
      // Clipboard blocked (e.g. insecure context); the token is still visible to select.
    }
  }
}
