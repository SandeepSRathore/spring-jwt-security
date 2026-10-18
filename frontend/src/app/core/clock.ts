import { Service, signal } from '@angular/core';

/** A shared one-second tick so countdowns and relative times stay live. */
@Service()
export class Clock {
  readonly now = signal(Date.now());

  constructor() {
    setInterval(() => this.now.set(Date.now()), 1000);
  }
}
