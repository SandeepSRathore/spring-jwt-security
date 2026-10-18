import { Service, signal } from '@angular/core';

export interface LogEntry {
  id: number;
  at: number;
  method: string;
  path: string;
  sentToken: boolean;
  status: number;
  code: string | null;
  note: string | null;
  durationMs: number;
}

const MAX_ENTRIES = 200;

@Service()
export class RequestLog {
  private nextId = 1;
  readonly entries = signal<LogEntry[]>([]);

  add(entry: Omit<LogEntry, 'id'>): void {
    const withId = { ...entry, id: this.nextId++ };
    this.entries.update((list) => [withId, ...list].slice(0, MAX_ENTRIES));
  }

  clear(): void {
    this.entries.set([]);
  }
}
