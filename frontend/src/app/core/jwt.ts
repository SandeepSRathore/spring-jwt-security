import { AccessClaims, DecodedJwt } from './models';

function base64UrlToBytes(segment: string): Uint8Array {
  const base64 = segment.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(segment.length / 4) * 4, '=');
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

function decodeSegment(segment: string): Record<string, unknown> {
  return JSON.parse(new TextDecoder().decode(base64UrlToBytes(segment))) as Record<string, unknown>;
}

/** Reads a JWT for display only. Verification happens on the server, never here. */
export function decodeJwt(token: string): DecodedJwt | null {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }
  try {
    return {
      segments: [parts[0], parts[1], parts[2]],
      header: decodeSegment(parts[0]),
      claims: decodeSegment(parts[1]) as unknown as AccessClaims,
    };
  } catch {
    return null;
  }
}
