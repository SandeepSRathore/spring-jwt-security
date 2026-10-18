import { DatePipe } from '@angular/common';
import { Component, inject } from '@angular/core';

import { RequestLog } from '../core/request-log';
import { StatusChip } from '../shared/status-chip';

@Component({
  selector: 'app-request-log-panel',
  imports: [DatePipe, StatusChip],
  template: `
    <section aria-labelledby="log-title">
      <div class="head">
        <h2 id="log-title">Requests <span class="count">{{ log.entries().length }}</span></h2>
        @if (log.entries().length) {
          <button type="button" class="btn btn-quiet btn-small" (click)="log.clear()">Clear</button>
        }
      </div>

      @if (log.entries().length) {
        <ol class="entries">
          @for (entry of log.entries(); track entry.id) {
            <li class="entry">
              <div class="line">
                <span class="method">{{ entry.method }}</span>
                <span class="path">{{ entry.path }}</span>
                <app-status-chip [status]="entry.status" />
              </div>
              <div class="meta">
                <time>{{ entry.at | date: 'HH:mm:ss' }}</time>
                <span>{{ entry.sentToken ? 'bearer token' : 'no token' }}</span>
                <span>{{ entry.durationMs }} ms</span>
                @if (entry.code) {
                  <span class="err">{{ entry.code }}</span>
                }
                @if (entry.note) {
                  <span class="note">{{ entry.note }}</span>
                }
              </div>
            </li>
          }
        </ol>
      } @else {
        <p class="muted empty">Every call this app makes to the API shows up here, including automatic refreshes and retries.</p>
      }
    </section>
  `,
  styles: `
    .head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 0.6rem;
      padding: 0 0.15rem;
    }

    .count {
      margin-left: 0.3rem;
      font-weight: 500;
      color: var(--ink-muted);
      font-variant-numeric: tabular-nums;
    }

    .entries {
      list-style: none;
      margin: 0;
      padding: 0;
      border-top: 1px solid var(--rule);
    }

    .entry {
      display: grid;
      gap: 0.2rem;
      padding: 0.55rem 0.15rem;
      border-bottom: 1px solid var(--rule);
    }

    .line {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      gap: 0.5rem;
      align-items: baseline;
      font-family: var(--font-data);
      font-size: 0.75rem;
    }

    .method {
      font-weight: 500;
      color: var(--ink-muted);
    }

    .path {
      overflow-wrap: anywhere;
    }

    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: 0.2rem 0.75rem;
      font-size: 0.75rem;
      color: var(--ink-muted);
    }

    .err {
      font-family: var(--font-data);
      color: var(--danger);
      font-weight: 500;
    }

    .note {
      color: var(--steel);
      font-weight: 500;
    }

    .empty {
      font-size: var(--step--1);
      padding: 0 0.15rem;
    }
  `,
})
export class RequestLogPanel {
  protected readonly log = inject(RequestLog);
}
