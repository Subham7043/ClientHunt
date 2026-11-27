import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { NextFunction, Request, Response } from 'express';

const ADMIN_EMAILS = new Set(['sharmajisubham65@gmail.com']);

let cachedProjectId = '';
function getProjectId(): string {
  if (cachedProjectId) return cachedProjectId;
  try {
    const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      const parsed = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      cachedProjectId = String(parsed.projectId || '');
    }
  } catch {
    // ignore
  }
  return cachedProjectId;
}

interface CertCache {
  certs: Record<string, string>;
  expiresAt: number;
}

let certCache: CertCache = { certs: {}, expiresAt: 0 };

async function getFirebasePublicCerts(): Promise<Record<string, string>> {
  if (Date.now() < certCache.expiresAt && Object.keys(certCache.certs).length > 0) {
    return certCache.certs;
  }
  const res = await fetch(
    'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com'
  );
  if (!res.ok) {
    throw new Error(`Failed to fetch Firebase public keys (${res.status})`);
  }
  const certs = (await res.json()) as Record<string, string>;
  const cacheControl = res.headers.get('cache-control') || '';
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
  const maxAgeSec = maxAgeMatch ? Number(maxAgeMatch[1]) : 3600;
  certCache = {
    certs,
    expiresAt: Date.now() + maxAgeSec * 1000,
  };
  return certs;
}

function base64UrlToBuffer(input: string): Buffer {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((input.length + 3) % 4);
  return Buffer.from(padded, 'base64');
}

export interface VerifiedUser {
  uid: string;
  email: string;
  emailVerified: boolean;
  isAdmin: boolean;
}

export interface AuthenticatedRequest extends Request {
  user?: VerifiedUser;
}

export async function verifyFirebaseIdToken(token: string): Promise<VerifiedUser> {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Malformed Firebase ID token');
  }
  const [headerB64, payloadB64, sigB64] = parts;
  const header = JSON.parse(base64UrlToBuffer(headerB64).toString('utf-8')) as {
    alg?: string;
    kid?: string;
  };
  const payload = JSON.parse(base64UrlToBuffer(payloadB64).toString('utf-8')) as {
    aud?: string;
    iss?: string;
    sub?: string;
    exp?: number;
    iat?: number;
    email?: string;
    email_verified?: boolean;
  };

  if (header.alg !== 'RS256' || !header.kid) {
    throw new Error('Unsupported token algorithm');
  }

  const projectId = getProjectId();
  if (!projectId) {
    throw new Error('Firebase project configuration not available');
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (!payload.exp || payload.exp <= nowSec) {
    throw new Error('Firebase ID token expired');
  }
  if (!payload.iat || payload.iat > nowSec + 300) {
    throw new Error('Firebase ID token issued in the future');
  }
  if (payload.aud !== projectId) {
    throw new Error('Token audience mismatch');
  }
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) {
    throw new Error('Token issuer mismatch');
  }
  if (!payload.sub || payload.sub.length > 128) {
    throw new Error('Invalid token subject');
  }

  const certs = await getFirebasePublicCerts();
  const cert = certs[header.kid];
  if (!cert) {
    throw new Error('Unknown signing key ID');
  }

  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(`${headerB64}.${payloadB64}`);
  verifier.end();
  const valid = verifier.verify(cert, base64UrlToBuffer(sigB64));
  if (!valid) {
    throw new Error('Invalid token signature');
  }

  const email = (payload.email || '').toLowerCase();
  const emailVerified = Boolean(payload.email_verified);
  return {
    uid: payload.sub,
    email,
    emailVerified,
    isAdmin: emailVerified && ADMIN_EMAILS.has(email),
  };
}

export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Authentication required. Please sign in.' });
      return;
    }
    const token = header.slice('Bearer '.length).trim();
    const user = await verifyFirebaseIdToken(token);
    req.user = user;
    next();
  } catch (err) {
    res.status(401).json({
      error: err instanceof Error ? err.message : 'Invalid authentication token.',
    });
  }
}

export function requireAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  if (!req.user || !req.user.isAdmin) {
    res.status(403).json({ error: 'Administrator access required.' });
    return;
  }
  next();
}

// Sliding-window rate limiter keyed by UID or IP
const rateBuckets = new Map<string, number[]>();

export function createRateLimiter(bucketPrefix: string, maxRequests: number, windowMs: number) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    const key = `${bucketPrefix}:${req.user?.uid || req.ip || 'anon'}`;
    const now = Date.now();
    const history = (rateBuckets.get(key) || []).filter((ts) => now - ts < windowMs);
    if (history.length >= maxRequests) {
      res.status(429).json({
        error: `Rate limit exceeded. Maximum ${maxRequests} requests per ${Math.round(windowMs / 1000)}s.`,
      });
      return;
    }
    history.push(now);
    rateBuckets.set(key, history);
    next();
  };
}
