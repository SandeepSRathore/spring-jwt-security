import { Component, computed, input } from '@angular/core';
import { FieldState } from '@angular/forms/signals';

/** Client-side validation messages once the field was touched, plus any server-side message. */
@Component({
  selector: 'app-field-errors',
  template: `
    @for (message of messages(); track message) {
      <p class="field-error">{{ message }}</p>
    }
  `,
})
export class FieldErrors {
  readonly state = input.required<FieldState<string>>();
  readonly server = input<string | undefined>();

  protected readonly messages = computed(() => {
    const state = this.state();
    const client = state.touched() ? state.errors().map((e) => e.message ?? e.kind) : [];
    const server = this.server();
    return server ? [...client.slice(0, 1), `Server: ${server}`] : client.slice(0, 1);
  });
}
