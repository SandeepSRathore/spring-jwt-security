import { Component, inject, signal } from '@angular/core';
import { FormField, email, form, minLength, pattern, required, submit } from '@angular/forms/signals';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { toApiFailure } from '../core/api-failure';
import { AuthService } from '../core/auth.service';
import { ApiFailure } from '../core/models';
import { FieldErrors } from '../shared/field-errors';

/** Mirrors the backend's rule so the user hears about it before the round trip. */
export const PASSWORD_RULE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,64}$/;
export const PASSWORD_HINT = '8 to 64 characters with an upper-case letter, a lower-case letter, a digit and a symbol.';

@Component({
  selector: 'app-login-page',
  imports: [FormField, FieldErrors],
  template: `
    <div class="page">
      <div class="page-head">
        <h1>{{ mode() === 'signin' ? 'Sign in' : 'Create an account' }}</h1>
        <p class="lede">
          Signing in gets you a 15-minute access token and a refresh token. Watch both in the panel on the right.
        </p>
      </div>

      @if (auth.notice(); as notice) {
        <div class="alert" [class.alert-info]="notice.code.startsWith('signed_out')" role="status">
          <strong>{{ notice.code.startsWith('signed_out') ? 'Signed out' : 'Your session ended' }}</strong>
          {{ notice.message }}
          <span class="code-chip">{{ notice.code }}</span>
        </div>
      }

      <div class="switch" role="group" aria-label="Choose form">
        <button type="button" [attr.aria-pressed]="mode() === 'signin'" (click)="switchTo('signin')">Sign in</button>
        <button type="button" [attr.aria-pressed]="mode() === 'register'" (click)="switchTo('register')">Create account</button>
      </div>

      @if (failure(); as failure) {
        <div class="alert" role="alert">
          <strong>{{ failureTitle(failure) }}</strong>
          {{ failure.message }}
          <span class="code-chip">{{ failure.status }} {{ failure.code }}</span>
        </div>
      }

      @if (mode() === 'signin') {
        <form class="form" novalidate (submit)="signIn($event)">
          <div class="field">
            <label for="si-email">Email</label>
            <input id="si-email" type="email" autocomplete="username" [formField]="signInForm.email"
                   [attr.aria-invalid]="signInForm.email().touched() && signInForm.email().invalid()" />
            <app-field-errors [state]="signInForm.email()" />
          </div>
          <div class="field">
            <label for="si-password">Password</label>
            <input id="si-password" type="password" autocomplete="current-password" [formField]="signInForm.password"
                   [attr.aria-invalid]="signInForm.password().touched() && signInForm.password().invalid()" />
            <app-field-errors [state]="signInForm.password()" />
          </div>
          <div>
            <button class="btn" type="submit" [disabled]="busy()">{{ busy() ? 'Signing in…' : 'Sign in' }}</button>
          </div>
          <p class="field-hint">
            The seeded admin is <code>admin&#64;example.com</code> with password <code>Admin&#64;12345</code>.
            <button type="button" class="link-btn" (click)="fillAdmin()">Fill in admin</button>
          </p>
        </form>
      } @else {
        <form class="form" novalidate (submit)="register($event)">
          <div class="field">
            <label for="re-name">Name</label>
            <input id="re-name" type="text" autocomplete="name" [formField]="registerForm.name"
                   [attr.aria-invalid]="registerForm.name().touched() && registerForm.name().invalid()" />
            <app-field-errors [state]="registerForm.name()" />
          </div>
          <div class="field">
            <label for="re-email">Email</label>
            <input id="re-email" type="email" autocomplete="username" [formField]="registerForm.email"
                   [attr.aria-invalid]="registerForm.email().touched() && registerForm.email().invalid()" />
            <app-field-errors [state]="registerForm.email()" [server]="failure()?.fieldErrors?.['email']" />
          </div>
          <div class="field">
            <label for="re-password">Password</label>
            <input id="re-password" type="password" autocomplete="new-password" aria-describedby="re-password-hint"
                   [formField]="registerForm.password"
                   [attr.aria-invalid]="registerForm.password().touched() && registerForm.password().invalid()" />
            <p id="re-password-hint" class="field-hint">{{ passwordHint }}</p>
            <app-field-errors [state]="registerForm.password()" [server]="failure()?.fieldErrors?.['password']" />
          </div>
          <div>
            <button class="btn" type="submit" [disabled]="busy()">{{ busy() ? 'Creating account…' : 'Create account' }}</button>
          </div>
        </form>
      }
    </div>
  `,
  styles: `
    .switch {
      display: inline-flex;
      justify-self: start;
      padding: 3px;
      border: 1px solid var(--rule-strong);
      border-radius: 8px;
      background: var(--sheet);
    }

    .switch button {
      min-height: 2.25rem;
      padding: 0 1rem;
      border: 0;
      border-radius: 6px;
      background: transparent;
      color: var(--ink-muted);
      font: inherit;
      font-weight: 600;
      cursor: pointer;
    }

    .switch button[aria-pressed='true'] {
      background: var(--ink);
      color: #fff;
    }

    .alert .code-chip {
      margin-left: 0.35rem;
    }

    .link-btn {
      padding: 0;
      border: 0;
      background: none;
      color: var(--steel);
      font: inherit;
      font-weight: 500;
      text-decoration: underline;
      text-underline-offset: 0.18em;
      cursor: pointer;
    }
  `,
})
export class LoginPage {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly passwordHint = PASSWORD_HINT;
  protected readonly mode = signal<'signin' | 'register'>('signin');
  protected readonly busy = signal(false);
  protected readonly failure = signal<ApiFailure | null>(null);

  private readonly signInModel = signal({ email: '', password: '' });
  protected readonly signInForm = form(this.signInModel, (p) => {
    required(p.email, { message: 'Enter your email.' });
    email(p.email, { message: 'Enter a valid email address.' });
    required(p.password, { message: 'Enter your password.' });
  });

  private readonly registerModel = signal({ name: '', email: '', password: '' });
  protected readonly registerForm = form(this.registerModel, (p) => {
    required(p.name, { message: 'Enter your name.' });
    required(p.email, { message: 'Enter your email.' });
    email(p.email, { message: 'Enter a valid email address.' });
    required(p.password, { message: 'Choose a password.' });
    minLength(p.password, 8, { message: 'Use at least 8 characters.' });
    pattern(p.password, PASSWORD_RULE, { message: 'Add an upper-case letter, a lower-case letter, a digit and a symbol.' });
  });

  protected switchTo(mode: 'signin' | 'register'): void {
    this.mode.set(mode);
    this.failure.set(null);
  }

  protected fillAdmin(): void {
    this.signInModel.set({ email: 'admin@example.com', password: 'Admin@12345' });
  }

  protected async signIn(event: Event): Promise<void> {
    event.preventDefault();
    await submit(this.signInForm, async () => {
      const { email: address, password } = this.signInModel();
      await this.attempt(() => firstValueFrom(this.auth.login(address, password)));
      return undefined;
    });
  }

  protected async register(event: Event): Promise<void> {
    event.preventDefault();
    await submit(this.registerForm, async () => {
      const { name, email: address, password } = this.registerModel();
      await this.attempt(async () => {
        await firstValueFrom(this.auth.register(name, address, password));
        await firstValueFrom(this.auth.login(address, password));
      });
      return undefined;
    });
  }

  protected failureTitle(failure: ApiFailure): string {
    switch (failure.code) {
      case 'invalid_credentials':
        return 'Email or password is wrong';
      case 'account_locked':
        return 'Account locked';
      case 'account_disabled':
        return 'Account disabled';
      case 'too_many_requests':
        return 'Too many attempts from this browser';
      case 'email_taken':
        return 'That email already has an account';
      case 'network_error':
        return 'API not reachable';
      default:
        return 'Request failed';
    }
  }

  private async attempt(action: () => Promise<unknown>): Promise<void> {
    this.busy.set(true);
    this.failure.set(null);
    try {
      await action();
      await this.router.navigate(['/account']);
    } catch (error) {
      this.failure.set(toApiFailure(error));
    } finally {
      this.busy.set(false);
    }
  }
}
