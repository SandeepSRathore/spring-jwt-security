import { Component, computed, input } from '@angular/core';

@Component({
  selector: 'app-status-chip',
  template: `<span class="code-chip" [class]="'code-chip ' + tone()">{{ label() }}</span>`,
})
export class StatusChip {
  readonly status = input.required<number>();

  protected readonly label = computed(() => (this.status() === 0 ? 'offline' : String(this.status())));
  protected readonly tone = computed(() => {
    const status = this.status();
    if (status >= 200 && status < 300) return 'ok';
    if (status === 0 || status === 401 || status === 403) return 'auth';
    return 'client';
  });
}
