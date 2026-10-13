import { describe, expect, it } from 'vitest';

import { createApp } from './app';

describe('GET /health', () => {
  it('responds 200 when the server is running', async () => {
    const app = createApp();

    const response = await app.request('/health');

    expect(response.status).toBe(200);
  });

  it('reports that the service is ok', async () => {
    const app = createApp();

    const response = await app.request('/health');

    await expect(response.json()).resolves.toEqual({ status: 'ok' });
  });
});

describe('unknown routes', () => {
  it('responds 404', async () => {
    const app = createApp();

    const response = await app.request('/not-a-real-route');

    expect(response.status).toBe(404);
  });
});
