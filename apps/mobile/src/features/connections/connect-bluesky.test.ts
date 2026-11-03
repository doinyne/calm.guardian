import { WebBrowserResultType, type WebBrowserAuthSessionResult } from 'expo-web-browser';

import { connectBluesky } from './connect-bluesky';

const CONNECT_RETURN_URL = 'calmguardian-test://connect/bluesky';

const AUTHORIZATION_URL = 'https://bsky.social/oauth/authorize?request_uri=urn:example';

type StubbedResponses = { completeStatus?: number };

/** Our API, stubbed at the network edge: start returns Bluesky's page, complete returns a status. */
function stubApi({ completeStatus = 201 }: StubbedResponses = {}) {
  const requests: { url: string; body: unknown }[] = [];
  jest.spyOn(global, 'fetch').mockImplementation((input, init) => {
    const url = input instanceof Request ? input.url : input.toString();
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
    requests.push({ url, body });
    if (url.endsWith('/connections/bluesky')) {
      return Promise.resolve(Response.json({ authorizationUrl: AUTHORIZATION_URL }));
    }
    return Promise.resolve(new Response(JSON.stringify({}), { status: completeStatus }));
  });
  return requests;
}

const browserReturns = (result: WebBrowserAuthSessionResult) => {
  const opened: [string, string][] = [];
  const openAuthSession = (url: string, returnUrl: string) => {
    opened.push([url, returnUrl]);
    return Promise.resolve(result);
  };
  return { openAuthSession, returnUrl: CONNECT_RETURN_URL, opened };
};

const backInApp = (query: string): WebBrowserAuthSessionResult => ({
  type: 'success',
  url: `${CONNECT_RETURN_URL}?${query}`,
});

afterEach(() => jest.restoreAllMocks());

describe('connecting Bluesky', () => {
  it("opens Bluesky's page, then completes the connection with the code it hands back", async () => {
    const requests = stubApi();
    const browser = browserReturns(backInApp('code=single-use-code'));

    await expect(connectBluesky(browser)).resolves.toBe('connected');

    expect(browser.opened).toEqual([[AUTHORIZATION_URL, CONNECT_RETURN_URL]]);
    expect(requests.at(-1)).toMatchObject({
      url: expect.stringMatching(/\/connections\/bluesky\/complete$/) as string,
      body: { code: 'single-use-code' },
    });
  });

  it('reports a cancel when the user closes the sign-in sheet', async () => {
    stubApi();

    await expect(
      connectBluesky(browserReturns({ type: WebBrowserResultType.CANCEL })),
    ).resolves.toBe('cancelled');
  });

  it('reports a cancel when the user says no on Bluesky', async () => {
    const requests = stubApi();

    await expect(connectBluesky(browserReturns(backInApp('status=cancelled')))).resolves.toBe(
      'cancelled',
    );
    expect(requests).toHaveLength(1);
  });

  it('reports that the account belongs to another Calm Guardian account', async () => {
    stubApi({ completeStatus: 409 });

    await expect(connectBluesky(browserReturns(backInApp('code=c')))).resolves.toBe(
      'connected-elsewhere',
    );
  });

  it.each([
    ['Bluesky sign-in failed', backInApp('status=failed'), 201],
    ['the code expired', backInApp('code=c'), 400],
  ])('reports a failure when %s', async (_case, result, completeStatus) => {
    stubApi({ completeStatus });

    await expect(connectBluesky(browserReturns(result))).resolves.toBe('failed');
  });
});
