import { Pipe, PipeTransform } from '@angular/core';

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s.toString().padStart(2, '0')}s`;
  return `${s}s`;
}

export function relativeTime(target: number, now: number): string {
  const diff = target - now;
  if (Math.abs(diff) < 1500) return 'now';
  return diff > 0 ? `in ${formatDuration(diff)}` : `${formatDuration(-diff)} ago`;
}

/** `{{ iso | relative: clock.now() }}`. Passing the tick as an argument keeps the pipe pure but live. */
@Pipe({ name: 'relative' })
export class RelativePipe implements PipeTransform {
  transform(value: string | number | null | undefined, now: number): string {
    if (value === null || value === undefined) return '—';
    const target = typeof value === 'number' ? value : Date.parse(value);
    return relativeTime(target, now);
  }
}

export function deviceLabel(userAgent: string | null): string {
  if (!userAgent) return 'Unknown device';
  const browser = /Edg\//.test(userAgent)
    ? 'Edge'
    : /Chrome\//.test(userAgent)
      ? 'Chrome'
      : /Firefox\//.test(userAgent)
        ? 'Firefox'
        : /Safari\//.test(userAgent)
          ? 'Safari'
          : null;
  const os = /Mac OS X/.test(userAgent)
    ? 'macOS'
    : /Windows/.test(userAgent)
      ? 'Windows'
      : /Android/.test(userAgent)
        ? 'Android'
        : /iPhone|iPad/.test(userAgent)
          ? 'iOS'
          : /Linux/.test(userAgent)
            ? 'Linux'
            : null;
  if (browser && os) return `${browser} on ${os}`;
  return userAgent.length > 40 ? `${userAgent.slice(0, 40)}…` : userAgent;
}
