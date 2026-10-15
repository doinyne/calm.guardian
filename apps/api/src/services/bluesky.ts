import { AtpAgent } from '@atproto/api'

const BLUESKY_SERVICE = 'https://bsky.social'

export function createAgent(): AtpAgent {
  return new AtpAgent({ service: BLUESKY_SERVICE })
}

export async function loginToBluesky(
  identifier: string,
  password: string
): Promise<{ agent: AtpAgent; did: string; handle: string }> {
  const agent = createAgent()
  const res = await agent.login({ identifier, password })
  return { agent, did: res.data.did, handle: res.data.handle }
}