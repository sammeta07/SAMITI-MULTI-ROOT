import 'dotenv/config';
import path from 'path';
import { mkdirSync } from 'fs';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyCookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import fastifyStatic from '@fastify/static';
import mercurius from 'mercurius';
import { typeDefs as samititypeDefs, resolvers as samitiResolvers } from './graphql/samiti-graphql';
import { closePool } from './config/db';

const fastify = Fastify({
  logger: true
});

// CORS Configured Origins Dynamic Setup
const allowedOrigins = (process.env.ALLOWED_ORIGIN || '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

fastify.register(cors, {
  origin: (origin: string | undefined, cb: (err: Error | null, allow: boolean) => void) => {
    if (!origin) return cb(null, true);
    if (origin.endsWith('.app.github.dev')) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);

    if (
      origin.startsWith('http://localhost:') || 
      origin.startsWith('http://127.0.0.1:') || 
      origin.startsWith('http://192.168.')
    ) {
      return cb(null, true);
    }

    cb(new Error(`Not allowed by CORS context - Origin: ${origin}`), false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'] // 🚀 OPTIMIZED: Pure GraphQL mein sirf GET (Playground) aur POST (Queries/Mutations) chahiye
});

// Cookie Engine Setup
fastify.register(fastifyCookie, { secret: process.env.COOKIE_SECRET || '3a7f9cTqP12xYz!4vR7bN8s' });

// JWT Core Module
fastify.register(jwt, {
  secret: process.env.JWT_SECRET || 'default-secret'
});

const uploadsRoot = path.join(process.cwd(), 'uploads');
mkdirSync(uploadsRoot, { recursive: true });

fastify.register(fastifyStatic, {
  root: uploadsRoot,
  prefix: '/media/'
});

// 🚀 GraphQL Core Module - Combined Endpoint Configuration
fastify.register(mercurius, {
  schema: samititypeDefs,
  resolvers: samitiResolvers,
  graphiql: true, // 🎯 Enrolling GraphiQL playground by default at '/graphiql'
  path: '/graphql', // 🚀 ALIGNED: Angular HttpClient matches this directly now
  context: (request, reply) => ({
    request,
    headers: request.headers,
    cookies: request.cookies,
    jwt: fastify.jwt,
    reply // Handled explicitly to let resolvers set secure HTTP-only cookies
  })
});

// Start server listening across network bounds
const start = async () => {
  const defaultPort = Number(process.env.PORT) || 3000;
  const maxAttempts = 20;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const port = defaultPort + attempt;

    try {
      await fastify.listen({ port, host: '0.0.0.0' });
      if (port !== defaultPort) {
        fastify.log.warn(`Port ${defaultPort} was busy, server started on ${port} instead.`);
      }
      console.log(`🚀 Pure GraphQL Server running at http://localhost:${port}/graphql`);
      console.log(`📊 GraphiQL Playground active at http://localhost:${port}/graphiql`);
      return;
    } catch (err) {
      const listenError = err as NodeJS.ErrnoException;
      if (listenError.code !== 'EADDRINUSE' || attempt === maxAttempts - 1) {
        fastify.log.error(err);
        process.exit(1);
      }
    }
  }
};

let shuttingDown = false;

const shutdown = async (signal: string, error?: unknown) => {
  if (shuttingDown) return;
  shuttingDown = true;

  const hasError = Boolean(error);
  const exitCode = hasError ? 1 : 0;
  const forceExitTimer = setTimeout(() => {
    fastify.log.error({ signal }, 'Forced shutdown after timeout');
    process.exit(1);
  }, 10_000);

  forceExitTimer.unref();

  if (hasError) {
    fastify.log.error({ signal, error }, 'Shutting down after runtime error');
  } else {
    fastify.log.info({ signal }, 'Shutting down server');
  }

  try {
    await fastify.close();
    await closePool();
    process.exit(exitCode);
  } catch (shutdownError) {
    fastify.log.error({ signal, shutdownError }, 'Graceful shutdown failed');
    process.exit(1);
  } finally {
    clearTimeout(forceExitTimer);
  }
};

process.once('SIGINT', () => {
  void shutdown('SIGINT');
});

process.once('SIGTERM', () => {
  void shutdown('SIGTERM');
});

process.once('unhandledRejection', reason => {
  void shutdown('unhandledRejection', reason);
});

process.once('uncaughtException', error => {
  void shutdown('uncaughtException', error);
});

void start();