import AgentAPI from 'apminsight';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import express, { NextFunction, Request, Response } from 'express';

// Sanity check for production: ensure compiled schema file exists so we fail fast with a helpful error
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compiledSchemaPath = path.join(__dirname, 'db', 'schema', 'app.js');
if (process.env.NODE_ENV === 'production') {
  if (!fs.existsSync(compiledSchemaPath)) {
    console.error(`Startup error: compiled schema file missing at ${compiledSchemaPath}. Did you run the TypeScript build step?`);
    // Print listing of dist/db to help diagnose packaging issues
    try {
      const schemaDir = path.join(__dirname, 'db', 'schema');
      console.error('Contents of', schemaDir, ':', fs.existsSync(schemaDir) ? fs.readdirSync(schemaDir) : '(not found)');
    } catch (e) {
      console.error('Failed to list dist/db/schema:', e);
    }
    process.exit(1);
  }

  // Print a short diagnostic of compiled schema files to make deployment issues clear in logs
  try {
    const schemaDir = path.join(__dirname, 'db', 'schema');
    const files = fs.existsSync(schemaDir) ? fs.readdirSync(schemaDir) : [];
    console.log('Startup diagnostic: dist/db/schema files =>', files);
    for (const f of files) {
      const p = path.join(schemaDir, f);
      try {
        const content = fs.readFileSync(p, { encoding: 'utf8' });
        console.log(`--- ${f} (first 300 chars) ---\n${content.slice(0, 300).replace(/\n/g, '\\n')}\n`);
      } catch (e) {
        console.warn('Could not read', p, e);
      }
    }
  } catch (e) {
    console.error('Schema diagnostic failed:', e);
  }
}
import subjectsRouter from './routes/subjects.js';
import usersRouter from './routes/users.js';
import classesRouter from './routes/classes.js';
import departmentsRouter from './routes/departments.js';
import enrollmentsRouter from './routes/enrollments.js';
import cors from 'cors';
import { authMiddleware } from './middleware/auth.js';
import securityMiddleware from './middleware/security.js';
import { toNodeHandler } from 'better-auth/node';
import { auth } from './lib/auth.js';

import { db } from './db/index.js';
import { sql } from 'drizzle-orm';
import { departments } from './db/schema/index.js';

AgentAPI.config();

const app = express();
const PORT = 8000;

const FRONTEND_URL = process.env.FRONTEND_URL;
if (!FRONTEND_URL) {
  throw new Error('FRONTEND_URL is not defined');
}

const allowedOrigins = FRONTEND_URL.split(',').map((origin) => origin.trim());

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);
      // Allow localhost in development (any port) to avoid CORS preflight failures when dev server port changes
      if (process.env.NODE_ENV !== 'production' && origin && origin.startsWith('http://localhost')) {
        return callback(null, true);
      }
      if (allowedOrigins.indexOf(origin) !== -1 || allowedOrigins.includes('*')) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    credentials: true,
  }),
);

app.use(express.json());

// Auth middleware: skip for auth endpoints
const authCheckMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const isAuthPath =
    req.path.startsWith('/api/auth') ||
    req.path.match(/^\/api\/(sign-in|sign-up|get-session|sign-out|verify|refresh-token)($|\/)/);

  if (isAuthPath) {
    return next();
  }

  authMiddleware(req, res, next);
};

app.use(authCheckMiddleware);
app.use(securityMiddleware);

// Auth handler wrapper
const createAuthHandler = (label: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const handler = toNodeHandler(auth);
    (async () => {
      try {
        await handler(req, res);
      } catch (e: any) {
        console.error(`Auth route error (${label}):`, e);
        const errMsg = String(e?.cause?.message || e?.message || '').toLowerCase();
        if (errMsg.includes('failed to parse url') || errMsg.includes('failed to connect') || errMsg.includes('database')) {
          return res.status(503).json({ error: 'Authentication service temporarily unavailable' });
        }
        next(e);
      }
    })();
  };
};

// Primary mount: /api/auth/*
app.use('/api/auth', createAuthHandler('auth'));

// Compatibility mount: rewrite /api/sign-in/* to /api/auth/sign-in/*, etc.
app.use('/api', (req: Request, res: Response, next: NextFunction) => {
  const match = req.path.match(/^\/(sign-in|sign-up|get-session|sign-out|verify|refresh-token)(\/.*|$)/);
  if (!match) {
    return next();
  }

  // Rewrite the path and url to /auth/<endpoint> for better-auth
  const endpoint = match[1];
  const rest = match[2] || '';
  req.url = `/auth/${endpoint}${rest}${req.url.slice(match[0].length)}`;

  const handler = toNodeHandler(auth);
  (async () => {
    try {
      await handler(req, res);
    } catch (e: any) {
      console.error('Auth route error (compat /api):', e);
      const errMsg = String(e?.cause?.message || e?.message || '').toLowerCase();
      if (errMsg.includes('failed to parse url') || errMsg.includes('failed to connect') || errMsg.includes('database')) {
        return res.status(503).json({ error: 'Authentication service temporarily unavailable' });
      }
      next(e);
    }
  })();
});

// Health check to verify DB connectivity
app.get('/api/health', async (req, res) => {
  try {
    // Try a lightweight select using a simple FROM (works around potential select-object ordering edgecases)
    await db.select().from(departments).limit(1);
    res.status(200).json({ status: 'ok' });
  } catch (e1) {
    console.error('Health primary check failed:', e1);
    try {
      // Fall back to a raw query using the underlying driver to avoid ORM edge cases
      const sqlClient = (db as any).client || (await import('@neondatabase/serverless')).neon(process.env.DATABASE_URL as string);
      const fallback = await sqlClient.query('SELECT 1');
      if (fallback) {
        return res.status(200).json({ status: 'ok', fallback: true });
      }
    } catch (e2) {
      console.error('Health fallback failed:', e2);
    }
    res.status(503).json({ status: 'down', error: 'Database unreachable' });
  }
});

// Resource routers
app.use('/api/subjects', subjectsRouter);
app.use('/api/users', usersRouter);
app.use('/api/classes', classesRouter);
app.use('/api/departments', departmentsRouter);
app.use('/api/enrollments', enrollmentsRouter);

// Global error handler
app.use((err: any, req: any, res: any, next: any) => {
  console.error('Unhandled error:', err);
  const msg = String(err?.cause?.message || err?.message || '').toLowerCase();
  if (msg.includes('failed to parse url') || msg.includes('failed to connect') || msg.includes('database')) {
    return res.status(503).json({ error: 'Service temporarily unavailable (DB issue)' });
  }
  res.status(500).json({ error: 'Internal Server Error' });
});

app.get('/', (req, res) => {
  res.send('Hello from the classroom backend!');
});

app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
