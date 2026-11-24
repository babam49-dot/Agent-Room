import { createHmac } from 'node:crypto';

export interface AuthUser {
  userId: string;
  orgId: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  name: string;
  email: string;
  avatarUrl?: string;
}

export interface AuthProvider {
  authenticate(tokenOrHeader: string): Promise<AuthUser | null>;
  generateDevToken(userId: string): Promise<string>;
}

export interface RealtimeTokenClaims {
  userId: string;
  orgId: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  name: string;
  exp: number; // unix epoch in seconds
}

export function signRealtimeToken(claims: Omit<RealtimeTokenClaims, 'exp'>, secret: string, expiresInSec: number = 300): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const exp = Math.floor(Date.now() / 1000) + expiresInSec;
  const payload = Buffer.from(JSON.stringify({ ...claims, exp })).toString('base64url');
  const signature = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}

export function verifyRealtimeToken(token: string, secret: string): RealtimeTokenClaims | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, payload, signature] = parts as [string, string, string];
    const expected = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
    if (signature !== expected) return null;

    const data: RealtimeTokenClaims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    const now = Math.floor(Date.now() / 1000);
    if (data.exp && data.exp < now) {
      return null; // expired
    }
    return data;
  } catch {
    return null;
  }
}

export class DevAuthProvider implements AuthProvider {
  constructor(private jwtSecret: string = 'dev-secret') {}

  async authenticate(tokenOrHeader: string): Promise<AuthUser | null> {
    if (!tokenOrHeader) return null;
    const token = tokenOrHeader.startsWith('Bearer ') ? tokenOrHeader.slice(7) : tokenOrHeader;
    const claims = verifyRealtimeToken(token, this.jwtSecret);
    if (!claims) return null;

    return {
      userId: claims.userId,
      orgId: claims.orgId,
      role: claims.role,
      name: claims.name,
      email: `${claims.name.toLowerCase().replace(/\s+/g, '.')}@acme.corp`,
    };
  }

  async generateDevToken(userId: string): Promise<string> {
    // Lookup dev user
    const users: Record<string, AuthUser> = {
      '01935e40-0002-7000-8000-000000000001': {
        userId: '01935e40-0002-7000-8000-000000000001',
        orgId: '01935e40-0001-7000-8000-000000000001',
        role: 'owner',
        name: 'Sara Chen',
        email: 'sara@acme.corp',
      },
      '01935e40-0002-7000-8000-000000000002': {
        userId: '01935e40-0002-7000-8000-000000000002',
        orgId: '01935e40-0001-7000-8000-000000000001',
        role: 'admin',
        name: 'Ahmed Hassan',
        email: 'ahmed@acme.corp',
      },
      '01935e40-0002-7000-8000-000000000003': {
        userId: '01935e40-0002-7000-8000-000000000003',
        orgId: '01935e40-0001-7000-8000-000000000001',
        role: 'member',
        name: 'Lina Mori',
        email: 'lina@acme.corp',
      },
    };

    const user = users[userId] || users['01935e40-0002-7000-8000-000000000001']!;
    return signRealtimeToken({
      userId: user.userId,
      orgId: user.orgId,
      role: user.role,
      name: user.name,
    }, this.jwtSecret, 86400); // 24h for dev
  }
}
