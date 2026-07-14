import type { AudioAssetProcessingInput } from '../../shared/types';

export const audioProtocolScheme = 'podcast-audio';

export function createAudioProtocolUrl(input: AudioAssetProcessingInput): string {
  assertProtocolId(input.projectId, 'project');
  assertProtocolId(input.assetId, 'asset');
  return `${audioProtocolScheme}://asset/${encodeURIComponent(input.projectId)}/${encodeURIComponent(input.assetId)}`;
}

export function parseAudioProtocolUrl(url: string): AudioAssetProcessingInput | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== `${audioProtocolScheme}:` || parsed.hostname !== 'asset' || parsed.search || parsed.hash) {
      return null;
    }
    const segments = parsed.pathname.split('/').filter(Boolean);
    if (segments.length !== 2) return null;
    const [projectId, assetId] = segments.map((segment) => decodeURIComponent(segment));
    if (!projectId || !assetId || !isProtocolId(projectId) || !isProtocolId(assetId)) return null;
    return { projectId, assetId };
  } catch {
    return null;
  }
}

export function createAudioProtocolRequestHandler(dependencies: {
  resolvePath: (input: AudioAssetProcessingInput) => Promise<string>;
  fetchFile: (filePath: string, request: Request) => Promise<Response>;
}): (request: Request) => Promise<Response> {
  return async (request) => {
    const input = parseAudioProtocolUrl(request.url);
    if (!input) {
      return new Response('Invalid audio asset URL.', { status: 400 });
    }
    try {
      const filePath = await dependencies.resolvePath(input);
      return await dependencies.fetchFile(filePath, request);
    } catch {
      return new Response('Audio asset not found.', { status: 404 });
    }
  };
}

function assertProtocolId(value: string, label: 'project' | 'asset'): void {
  if (!isProtocolId(value)) {
    throw new Error(`Invalid ${label} id for audio protocol.`);
  }
}

function isProtocolId(value: string): boolean {
  return value !== '.' && value !== '..' && /^[\p{L}\p{N}._-]+$/u.test(value);
}
