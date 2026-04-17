import type { IncomingMessage, ServerResponse } from 'http';

export const config = {
  runtime: 'nodejs'
};

export default function handler(_req: IncomingMessage, res: ServerResponse): void {
  try {
    const payload = {
      ok: true,
      data: {
        status: 'diag-ok',
        deployId: process.env.VERCEL_DEPLOYMENT_ID || null,
        gitCommit: process.env.VERCEL_GIT_COMMIT_SHA || null,
        gitBranch: process.env.VERCEL_GIT_COMMIT_REF || null,
        vercelEnv: process.env.VERCEL_ENV || null,
        nodeVersion: process.version,
        hasDatabaseUrl: Boolean(process.env.DATABASE_URL),
        timestamp: new Date().toISOString()
      }
    };
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(payload));
  } catch (error) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ ok: false, message: error instanceof Error ? error.message : String(error) }));
  }
}
