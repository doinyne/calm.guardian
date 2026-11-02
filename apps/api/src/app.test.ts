import { describe, expect, it } from 'vitest';

import { createApp, type AppDependencies } from './app';
import { captureLogs } from './testing/log-capture';

function buildApp(overrides: Partial<AppDependencies> = {}) {
  const logs = captureLogs();
  const app = createApp({ logger: logs.logger, readinessChecks: [], ...overrides });
  return { app, logs };
}

describe('GET /health', () => {
  it('reports ok', async () => {
    const { app } = buildApp();

    const response = await app.request('/health');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: 'ok' });
  });

  it('stays ok when a dependency is down, so the instance is not restarted for it', async () => {
    const { app } = buildApp({
      readinessChecks: [{ name: 'database', check: () => Promise.reject(new Error('down')) }],
    });

    const response = await app.request('/health');

    expect(response.status).toBe(200);
  });
});

describe('GET /ready', () => {
  it('reports ok when every readiness check passes', async () => {
    const { app } = buildApp({
      readinessChecks: [{ name: 'database', check: () => Promise.resolve() }],
    });

    const response = await app.request('/ready');

    expect(response.status).toBe(200);
  });

  it('responds 503 in the error shape when a readiness check fails', async () => {
    const { app } = buildApp({
      readinessChecks: [{ name: 'database', check: () => Promise.reject(new Error('down')) }],
    });

    const response = await app.request('/ready');

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'service_unavailable' },
    });
  });

  it('logs which check failed', async () => {
    const { app, logs } = buildApp({
      readinessChecks: [{ name: 'database', check: () => Promise.reject(new Error('down')) }],
    });

    await app.request('/ready');

    expect(logs.output()).toContain('database');
  });
});

describe('unknown routes', () => {
  it('respond 404 in the error shape, with the request id the response header carries', async () => {
    const { app } = buildApp();

    const response = await app.request('/not-a-real-route');

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'not_found',
        message: expect.any(String) as string,
        requestId: response.headers.get('x-request-id'),
      },
    });
  });
});

describe('unexpected errors', () => {
  function buildAppWithFailingRoute(message: string) {
    const built = buildApp();
    built.app.get('/fails', () => {
      throw new Error(message);
    });
    return built;
  }

  it('respond 500 with a generic message that leaks nothing internal', async () => {
    const internalDetail = 'connection to db.internal:5432 refused';
    const { app } = buildAppWithFailingRoute(internalDetail);

    const response = await app.request('/fails');

    expect(response.status).toBe(500);
    const body = await response.text();
    expect(body).toContain('internal_error');
    expect(body).not.toContain(internalDetail);
  });

  it('are logged in full so we can debug them', async () => {
    const internalDetail = 'connection to db.internal:5432 refused';
    const { app, logs } = buildAppWithFailingRoute(internalDetail);

    await app.request('/fails');

    expect(logs.output()).toContain(internalDetail);
  });
});

describe('request size limit', () => {
  it('rejects bodies over the limit with 413 in the error shape', async () => {
    const { app } = buildApp();

    const response = await app.request('/anything', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'x'.repeat(200 * 1024) }),
    });

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'payload_too_large' } });
  });
});

describe('request logging', () => {
  it('logs the method, path and status of each request', async () => {
    const { app, logs } = buildApp();

    await app.request('/health');

    expect(logs.entries()).toContainEqual(
      expect.objectContaining({ method: 'GET', path: '/health', status: 200 }),
    );
  });

  it('never logs query strings or headers, which can carry one-time codes and tokens', async () => {
    const { app, logs } = buildApp();

    await app.request('/health?code=one-time-oauth-code', {
      headers: { authorization: 'Bearer secret-access-token' },
    });

    expect(logs.output()).not.toContain('one-time-oauth-code');
    expect(logs.output()).not.toContain('secret-access-token');
  });
});
