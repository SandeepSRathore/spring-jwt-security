import { HttpClient, HttpContext } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { toApiFailure } from '../core/api-failure';
import { AuthService } from '../core/auth.service';
import { Clock } from '../core/clock';
import { RelativePipe, deviceLabel } from '../core/format';
import { LOG_NOTE } from '../core/http-context';
import { ApiFailure, SessionInfo } from '../core/models';

@Component({
  selector: 'app-sessions-page',
  imports: [RelativePipe],
  template: `
    <div class="page">
      <div class="page-head">
        <h1>Devices</h1>
        <p class="lede">
          Every active login is a session on the server. Each one has its own refresh token; the access tokens
          it issues carry its id. Revoke a session and its tokens stop working at once.
        </p>
      </div>

      <section class="section">
        <div class="row">
          <h2>Active sessions</h2>
          <div class="row-actions">
            <button type="button" class="btn btn-quiet btn-small" (click)="load()" [disabled]="loading()">
              {{ loading() ? 'Loading…' : 'Reload' }}
            </button>
            <button type="button" class="btn btn-danger btn-small" (click)="signOutEverywhere()"
                    [disabled]="busy() || !sessions().length">
              Sign out everywhere
            </button>
          </div>
        </div>

        @if (error(); as err) {
          <div class="alert" role="alert"><strong>Couldn’t load sessions</strong>{{ err.message }}</div>
        }

        @if (sessions().length) {
          <div class="table-wrap">
            <table class="table">
              <caption class="sr-only">Your active sessions</caption>
              <thead>
                <tr>
                  <th scope="col">Device</th>
                  <th scope="col">IP</th>
                  <th scope="col">Started</th>
                  <th scope="col">Last used</th>
                  <th scope="col">Expires</th>
                  <th scope="col"><span class="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                @for (session of sessions(); track session.id) {
                  <tr [class.current]="session.current">
                    <td>
                      <span class="device">{{ device(session.userAgent) }}</span>
                      @if (session.current) {
                        <span class="here">This device</span>
                      }
                      <span class="sid data">{{ session.id.slice(0, 8) }}</span>
                    </td>
                    <td class="data">{{ session.ipAddress ?? '—' }}</td>
                    <td>{{ session.createdAt | relative: clock.now() }}</td>
                    <td>{{ session.lastUsedAt | relative: clock.now() }}</td>
                    <td>{{ session.expiresAt | relative: clock.now() }}</td>
                    <td class="actions">
                      <button type="button" class="btn btn-danger btn-small" (click)="revoke(session)"
                              [disabled]="busy()">
                        {{ session.current ? 'Sign out' : 'Revoke' }}
                      </button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        } @else if (!loading()) {
          <p class="muted">No active sessions.</p>
        }
      </section>
    </div>
  `,
  styles: `
    .row {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem 1.5rem;
      align-items: center;
      justify-content: space-between;
    }

    .row-actions {
      display: flex;
      gap: 0.6rem;
    }

    tr.current td {
      background: var(--tint-steel);
    }

    .device {
      font-weight: 600;
      display: block;
    }

    .here {
      display: inline-block;
      margin-top: 0.15rem;
      padding: 0.05rem 0.4rem;
      border-radius: 4px;
      background: var(--steel);
      color: #fff;
      font-size: 0.7rem;
      font-weight: 600;
    }

    .sid {
      display: block;
      margin-top: 0.2rem;
      color: var(--ink-muted);
    }

    .actions {
      text-align: right;
    }
  `,
})
export class SessionsPage {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  protected readonly clock = inject(Clock);

  protected readonly sessions = signal<SessionInfo[]>([]);
  protected readonly loading = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<ApiFailure | null>(null);

  protected readonly device = deviceLabel;

  constructor() {
    this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const list = await firstValueFrom(
        this.http.get<SessionInfo[]>('/api/auth/sessions', {
          context: new HttpContext().set(LOG_NOTE, 'list sessions'),
        }),
      );
      // Current device first, then most recently used.
      this.sessions.set(
        [...list].sort((a, b) =>
          a.current === b.current ? Date.parse(b.lastUsedAt) - Date.parse(a.lastUsedAt) : a.current ? -1 : 1,
        ),
      );
    } catch (error) {
      this.error.set(toApiFailure(error));
    } finally {
      this.loading.set(false);
    }
  }

  protected async revoke(session: SessionInfo): Promise<void> {
    if (session.current) {
      await this.auth.logout();
      return;
    }
    this.busy.set(true);
    try {
      await firstValueFrom(
        this.http.delete<void>(`/api/auth/sessions/${session.id}`, {
          context: new HttpContext().set(LOG_NOTE, 'revoke session'),
        }),
      );
      this.sessions.update((list) => list.filter((s) => s.id !== session.id));
    } catch (error) {
      this.error.set(toApiFailure(error));
    } finally {
      this.busy.set(false);
    }
  }

  protected async signOutEverywhere(): Promise<void> {
    this.busy.set(true);
    try {
      await this.auth.logoutEverywhere();
    } finally {
      this.busy.set(false);
    }
  }
}
