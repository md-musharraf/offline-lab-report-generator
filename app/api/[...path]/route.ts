// Dev-server (`next dev`) entry for every /api/* call. The packaged desktop app serves the same
// handlers from Electron's app:// protocol; see lib/server-api.js. Excluded from the static export.
import { PrismaClient } from '../../../prisma/client';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const api = require('../../../lib/server-api');

export const dynamic = 'force-dynamic';

const g = globalThis as unknown as { prisma?: PrismaClient };
const prisma = (g.prisma ??= new PrismaClient());
const ctx = { prisma, dataDir: process.cwd() };

export const GET = (req: Request) => api.handleRequest(ctx, req);
export const POST = GET;
