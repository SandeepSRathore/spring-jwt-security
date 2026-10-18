import { DatePipe } from '@angular/common';
import { HttpClient, HttpContext } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormField, form, minLength, pattern, required, submit, validate } from '@angular/forms/signals';
import { firstValueFrom } from 'rxjs';

import { toApiFailure } from '../core/api-failure';
import { AuthService } from '../core/auth.service';
import { LOG_NOTE } from '../core/http-context';
import { ApiFailure, UserProfile } from '../core/models';
import { TokenStore } from '../core/token-store';
import { FieldErrors } from '../shared/field-errors';
import { PASSWORD_HINT, PASSWORD_RULE } from './login.page';

@Component({
  selector: 'app-account-page',
  imports: [FormField, FieldErrors, DatePipe],
  template: `
    <div class="page">
      <div class="page-head">
        <h1>Account</h1>
        <p class="lede">
          Your profile, straight from <code>GET /api/users/me</code>. The access token on the right is what
          authorises this call; when it runs low, use Refresh to trade the refresh token for a new one.
        </p>
      </div>

      <section class="section">
        <div class="row">
          <h2>Who the API thinks you are</h2>
          <div class="row-actions">
            <button type="button" class="btn btn-quiet btn-small" (click)="loadProfile()" [disabled]="loadingProfile()">
              {{ loadingProfile() ? 'Loading…' : 'Reload' }}
            </button>
            <button type="button" class="btn btn-small" (click)="refresh()" [disabled]="refreshing()">
              {{ refreshing() ? 'Refreshing…' : 'Refresh token' }}
            </button>
          </div>
        </div>

        @if (profile(); as me) {
          <dl class="facts">
            <div><dt>Name</dt><dd>{{ me.name }}</dd></div>
            <div><dt>Email</dt><dd>{{ me.email }}</dd></div>
            <div><dt>User id</dt><dd class="data">{{ me.id }}</dd></div>
            <div><dt>Roles</dt><dd>{{ me.roles.join(', ') }}</dd></div>
            <div><dt>Member since</dt><dd>{{ me.createdAt | date: 'medium' }}</dd></div>
          </dl>
        } @else if (profileError()) {
          <p class="muted">Couldn’t load your profile: {{ profileError()?.message }}</p>
        }

        @if (refreshNote(); as note) {
          <p class="inline-note" [class.inline-note-err]="note.error" role="status">{{ note.text }}</p>
        }
      </section>

      <section class="section">
        <h2>Change your password</h2>
        <p class="muted">
          Changing it signs out every other device at once; this one stays. Each device’s refresh token
          stops working immediately, not whenever its access token would have expired.
        </p>

        @if (passwordFailure(); as failure) {
          <div class="alert" role="alert">
            <strong>{{ passwordTitle(failure) }}</strong>
            {{ failure.message }}
            <span class="code-chip">{{ failure.status }} {{ failure.code }}</span>
          </div>
        }
        @if (passwordDone(); as done) {
          <div class="alert alert-ok" role="status">
            <strong>Password changed</strong>
            {{ done }}
          </div>
        }

        <form class="form" novalidate (submit)="changePassword($event)">
          <div class="field">
            <label for="cur">Current password</label>
            <input id="cur" type="password" autocomplete="current-password" [formField]="pwForm.currentPassword"
                   [attr.aria-invalid]="pwForm.currentPassword().touched() && pwForm.currentPassword().invalid()" />
            <app-field-errors [state]="pwForm.currentPassword()" />
          </div>
          <div class="field">
            <label for="next">New password</label>
            <input id="next" type="password" autocomplete="new-password" aria-describedby="next-hint"
                   [formField]="pwForm.newPassword"
                   [attr.aria-invalid]="pwForm.newPassword().touched() && pwForm.newPassword().invalid()" />
            <p id="next-hint" class="field-hint">{{ passwordHint }}</p>
            <app-field-errors [state]="pwForm.newPassword()" />
          </div>
          <div>
            <button class="btn" type="submit" [disabled]="changingPassword()">
              {{ changingPassword() ? 'Changing…' : 'Change password' }}
            </button>
          </div>
        </form>
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

    .facts {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr));
      gap: 0.9rem 2rem;
      margin: 0;
    }

    .facts dt {
      color: var(--ink-muted);
      font-size: var(--step--1);
    }

    .facts dd {
      margin: 0.1rem 0 0;
      font-weight: 500;
      overflow-wrap: anywhere;
    }

    .inline-note {
      font-size: var(--step--1);
      color: var(--valid);
      font-weight: 500;
    }

    .inline-note-err {
      color: var(--danger);
    }

    .alert .code-chip {
      margin-left: 0.35rem;
    }
  `,
})
export class AccountPage {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  protected readonly store = inject(TokenStore);

  protected readonly passwordHint = PASSWORD_HINT;

  protected readonly profile = signal<UserProfile | null>(null);
  protected readonly profileError = signal<ApiFailure | null>(null);
  protected readonly loadingProfile = signal(false);
  protected readonly refreshing = signal(false);
  protected readonly refreshNote = signal<{ text: string; error: boolean } | null>(null);

  protected readonly changingPassword = signal(false);
  protected readonly passwordFailure = signal<ApiFailure | null>(null);
  protected readonly passwordDone = signal<string | null>(null);

  private readonly pwModel = signal({ currentPassword: '', newPassword: '' });
  protected readonly pwForm = form(this.pwModel, (p) => {
    required(p.currentPassword, { message: 'Enter your current password.' });
    required(p.newPassword, { message: 'Choose a new password.' });
    minLength(p.newPassword, 8, { message: 'Use at least 8 characters.' });
    pattern(p.newPassword, PASSWORD_RULE, {
      message: 'Add an upper-case letter, a lower-case letter, a digit and a symbol.',
    });
    validate(p.newPassword, ({ value, valueOf }) =>
      value() && value() === valueOf(p.currentPassword)
        ? { kind: 'reuse', message: 'The new password must differ from the current one.' }
        : null,
    );
  });

  constructor() {
    this.loadProfile();
  }

  protected async loadProfile(): Promise<void> {
    this.loadingProfile.set(true);
    this.profileError.set(null);
    try {
      const me = await firstValueFrom(
        this.http.get<UserProfile>('/api/users/me', {
          context: new HttpContext().set(LOG_NOTE, 'account page'),
        }),
      );
      this.profile.set(me);
    } catch (error) {
      this.profileError.set(toApiFailure(error));
    } finally {
      this.loadingProfile.set(false);
    }
  }

  protected async refresh(): Promise<void> {
    this.refreshing.set(true);
    this.refreshNote.set(null);
    try {
      await firstValueFrom(this.auth.refresh('account page'));
      this.refreshNote.set({ text: 'Got a fresh access token and a new refresh token.', error: false });
    } catch (error) {
      this.refreshNote.set({ text: `Refresh failed: ${toApiFailure(error).message}`, error: true });
    } finally {
      this.refreshing.set(false);
    }
  }

  protected async changePassword(event: Event): Promise<void> {
    event.preventDefault();
    this.passwordDone.set(null);
    this.passwordFailure.set(null);
    await submit(this.pwForm, async () => {
      this.changingPassword.set(true);
      try {
        const { currentPassword, newPassword } = this.pwModel();
        const result = await firstValueFrom(this.auth.changePassword(currentPassword, newPassword));
        this.passwordDone.set(
          result.otherSessionsRevoked > 0
            ? `${result.message} (${result.otherSessionsRevoked} other session(s) signed out).`
            : result.message,
        );
        this.pwModel.set({ currentPassword: '', newPassword: '' });
      } catch (error) {
        this.passwordFailure.set(toApiFailure(error));
      } finally {
        this.changingPassword.set(false);
      }
      return undefined;
    });
  }

  protected passwordTitle(failure: ApiFailure): string {
    switch (failure.code) {
      case 'invalid_current_password':
        return 'Current password is wrong';
      case 'password_reuse':
        return 'Choose a different password';
      case 'account_locked':
        return 'Account locked';
      default:
        return 'Couldn’t change the password';
    }
  }
}
