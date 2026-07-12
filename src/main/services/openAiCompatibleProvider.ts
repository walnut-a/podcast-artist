import type { ProviderProfile } from '../../shared/types';

export interface ResearchProviderRequest {
  profile: ProviderProfile;
  prompt: string;
  contextMarkdown: string;
}

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export async function requestResearchMarkdown(
  input: ResearchProviderRequest,
  fetchImpl: FetchLike = fetch
): Promise<string> {
  const { profile } = input;
  if (!profile.baseUrl?.trim()) throw new Error(`Provider ${profile.displayName} is missing a base URL.`);
  if (!profile.model?.trim()) throw new Error(`Provider ${profile.displayName} is missing a model.`);
  if (!['chat', 'research'].includes(profile.kind) || !profile.capabilities.includes('research')) {
    throw new Error(`Provider ${profile.displayName} does not support research tasks.`);
  }

  const headers = new Headers({ 'content-type': 'application/json' });
  if (profile.credentialSource.kind === 'environment') {
    const token = process.env[profile.credentialSource.envVar]?.trim();
    if (!token) throw new Error(`Credential environment variable ${profile.credentialSource.envVar} is not set.`);
    headers.set('authorization', `Bearer ${token}`);
  } else if (profile.credentialSource.kind === 'runtime_prompt') {
    throw new Error('Runtime credential input is not supported for research tasks yet.');
  }

  const response = await fetchImpl(`${profile.baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: profile.model,
      stream: false,
      messages: [
        { role: 'system', content: '你是播客资料助手。返回可供用户审阅的 Markdown，不要声称已经写入文稿。' },
        { role: 'user', content: `任务：\n${input.prompt}\n\n上下文：\n${input.contextMarkdown}` }
      ]
    })
  });
  if (!response.ok) {
    const detail = (await response.text()).trim().slice(0, 1000);
    throw new Error(`Provider request failed (${response.status}): ${detail || response.statusText}`);
  }
  const data = (await response.json()) as { choices?: Array<{ message?: { content?: unknown } }> };
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) throw new Error('Provider response did not contain message content.');
  return content.trim();
}
