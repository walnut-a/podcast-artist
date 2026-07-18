import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('renderer research-task and timeline wiring contracts', () => {
  it('disables the task-start button when no project is selected', async () => {
    const source = await readFile(new URL('./App.tsx', import.meta.url), 'utf8');

    expect(source).toMatch(
      /disabled=\{[^}]*!currentProjectId[^}]*isSubmittingTask[^}]*!selectedProviderProfileId[^}]*!taskPrompt\.trim\(\)[^}]*\}/
    );
  });

  it('wires playhead split through Electron, browser mock, right-clip selection, and timeline focus handoff', async () => {
    const [appSource, apiClientSource, mainSource, preloadSource] = await Promise.all([
      readFile(new URL('./App.tsx', import.meta.url), 'utf8'),
      readFile(new URL('./apiClient.ts', import.meta.url), 'utf8'),
      readFile(new URL('../../main/index.ts', import.meta.url), 'utf8'),
      readFile(new URL('../../preload/index.ts', import.meta.url), 'utf8')
    ]);

    expect(mainSource).toContain("ipcMain.handle('audio:splitClip'");
    expect(preloadSource).toContain("ipcRenderer.invoke('audio:splitClip', input)");
    expect(apiClientSource).toContain('splitAudioClipInPlan({');
    expect(appSource).toContain("event.key.toLowerCase() === 's'");
    expect(appSource).toContain('podcastArtistApi.splitAudioClip({');
    expect(appSource).toContain('setSelectedClipId(result.rightClipId)');
    expect(appSource).toContain('timelinePanelRef.current?.focus()');
    expect(appSource).toContain('在播放头切开');
  });

  it('keeps an imported asset when cache processing fails and reports the partial result', async () => {
    const source = await readFile(new URL('./App.tsx', import.meta.url), 'utf8');
    const processingCall = source.indexOf('await processImportedAudioAsset(');
    const workspaceRefresh = source.indexOf('const workspace = await podcastArtistApi.refreshWorkspace();', processingCall);

    expect(processingCall).toBeGreaterThan(-1);
    expect(workspaceRefresh).toBeGreaterThan(processingCall);
    expect(source).toContain('素材已保留，但音频处理未完成：');
    expect(source).toContain('已导入并完成音频处理：');
  });
});
