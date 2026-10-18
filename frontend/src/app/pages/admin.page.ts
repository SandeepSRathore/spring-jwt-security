import { HttpClient, HttpContext } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { toApiFailure } from '../core/api-failure';
import { Clock } from '../core/clock';
import { RelativePipe } from '../core/format';
import { LOG_NOTE } from '../core/http-context';
import { AdminUser, ApiFailure } from '../core/models';
import { TokenStore } from '../core/token-store';

type AdminAction = 'disable' | 'enable' | 'unlock';

@Component({
  selector: 'app-admin-page',
  imports: [RelativePipe],
  template: `
    <div class="page">
      <div class="page-head">
        <h1>Users</h1>
        <p class="lede">
          Admin-only, behind <code>ROLE_ADMIN</code>. Disabling an account revokes its sessions, so the user’s
          tokens stop working on their next request. Unlock clears a brute-force lock early.
        </p>
      </div>

      <section class="section">
        <div class="row">
          <h2>All accounts</h2>
          <button type="button" class="btn btn-quiet btn-small" (click)="load()" [disabled]="loading()">
            {{ loading() ? 'Loading…' : 'Reload' }}
          </button>
        </div>

        @if (error(); as err) {
          <div class="alert" role="alert"><strong>Request failed</strong>{{ err.message }}</div>
        }

        @if (users().length) {
          <div class="table-wrap">
            <table class="table">
              <caption class="sr-only">All user accounts</caption>
              <thead>
                <tr>
                  <th scope="col">User</th>
                  <th scope="col">Roles</th>
                  <th scope="col">Status</th>
                  <th scope="col">Sessions</th>
                  <th scope="col"><span class="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                @for (user of users(); track user.id) {
                  <tr>
                    <td>
                      <span class="name">{{ user.name }}</span>
                      <span class="email">{{ user.email }}</span>
                      @if (user.id.toString() === store.decoded()?.claims?.sub) {
                        <span class="you">You</span>
                      }
                    </td>
                    <td>{{ user.roles.join(', ') }}</td>
                    <td>
                      @if (!user.enabled) {
                        <span class="code-chip auth">disabled</span>
                      } @else if (user.locked) {
                        <span class="code-chip client">locked {{ user.lockedUntil | relative: clock.now() }}</span>
                      } @else {
                        <span class="code-chip ok">active</span>
                      }
                      @if (user.enabled && user.failedLoginAttempts > 0) {
                        <span class="fails">{{ user.failedLoginAttempts }} failed</span>
                      }
                    </td>
                    <td class="data">{{ user.activeSessions }}</td>
                    <td class="actions">
                      @if (user.enabled) {
                        <button type="button" class="btn btn-danger btn-small"
                                [disabled]="busyId() === user.id || isSelf(user)"
                                [title]="isSelf(user) ? 'You can’t disable yourself' : ''"
                                (click)="act(user, 'disable')">Disable</button>
                      } @else {
                        <button type="button" class="btn btn-small" [disabled]="busyId() === user.id"
                                (click)="act(user, 'enable')">Enable</button>
                      }
                      @if (user.locked) {
                        <button type="button" class="btn btn-quiet btn-small" [disabled]="busyId() === user.id"
                                (click)="act(user, 'unlock')">Unlock</button>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        } @else if (!loading()) {
          <p class="muted">No users.</p>
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

    .name {
      font-weight: 600;
      display: block;
    }

    .email {
      color: var(--ink-muted);
      font-size: 0.8rem;
    }

    .you {
      display: inline-block;
      margin-left: 0.4rem;
      padding: 0.02rem 0.4rem;
      border-radius: 4px;
      background: var(--steel);
      color: #fff;
      font-size: 0.68rem;
      font-weight: 600;
    }

    .fails {
      display: block;
      margin-top: 0.25rem;
      font-size: 0.72rem;
      color: var(--warn);
    }

    .actions {
      display: flex;
      gap: 0.4rem;
      justify-content: flex-end;
    }
  `,
})
export class AdminPage {
  private readonly http = inject(HttpClient);
  protected readonly store = inject(TokenStore);
  protected readonly clock = inject(Clock);

  protected readonly users = signal<AdminUser[]>([]);
  protected readonly loading = signal(false);
  protected readonly busyId = signal<number | null>(null);
  protected readonly error = signal<ApiFailure | null>(null);

  constructor() {
    this.load();
  }

  protected isSelf(user: AdminUser): boolean {
    return user.id.toString() === this.store.decoded()?.claims.sub;
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const list = await firstValueFrom(
        this.http.get<AdminUser[]>('/api/admin/users', {
          context: new HttpContext().set(LOG_NOTE, 'list users'),
        }),
      );
      this.users.set([...list].sort((a, b) => a.id - b.id));
    } catch (error) {
      this.error.set(toApiFailure(error));
    } finally {
      this.loading.set(false);
    }
  }

  protected async act(user: AdminUser, action: AdminAction): Promise<void> {
    this.busyId.set(user.id);
    this.error.set(null);
    try {
      const updated = await firstValueFrom(
        this.http.post<AdminUser>(`/api/admin/users/${user.id}/${action}`, null, {
          context: new HttpContext().set(LOG_NOTE, `${action} user`),
        }),
      );
      this.users.update((list) => list.map((u) => (u.id === updated.id ? updated : u)));
    } catch (error) {
      this.error.set(toApiFailure(error));
    } finally {
      this.busyId.set(null);
    }
  }
}
