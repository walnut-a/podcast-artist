import { access, chmod, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AppSettings } from '../../shared/types';
import {
  addAudioClipToEditPlan,
  analyzeAudioAsset,
  appendTaskResultToDocument,
  applyPendingWriteIntents,
  buildFfmpegRenderArgs,
  createResearchTask,
  createMarkdownAppendIntent,
  createProject,
  ensureWorkspace,
  exportAudioEditPlan,
  generateAudioPeaks,
  generateAudioProxy,
  importLibraryAsset,
  readAudioAssetPlaybackData,
  readAudioEditPlan,
  readProjectLibrary,
  rippleDeleteAudioClip,
  updateAudioClipTiming
} from './workspace';

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), 'podcast-artist-workspace-'));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe('workspace local file contract', () => {
  it('creates the workspace manifest and shared asset index', async () => {
    const settings = createSettings(tempDir);

    const workspace = await ensureWorkspace(settings);

    expect(workspace.manifest.schemaVersion).toBe('workspace.v1');
    await expectFile(path.join(tempDir, 'workspace.json'));
    await expectFile(path.join(tempDir, 'library', 'shared', 'assets.json'));
  });

  it('creates a project with markdown, assets index, journal folders, and edit plan', async () => {
    const settings = createSettings(tempDir);

    const project = await createProject(settings, { title: '第 24 期 本地优先' });
    const projectRoot = path.join(tempDir, project.projectPath);

    await expectFile(path.join(projectRoot, 'project.json'));
    await expectFile(path.join(projectRoot, 'episode.md'));
    await expectFile(path.join(tempDir, 'library', 'projects', project.slug, 'assets.json'));
    await expectFile(path.join(projectRoot, '.podcast-artist', 'write-journal', 'pending'));
    await expectFile(path.join(projectRoot, '.podcast-artist', 'edit-plans', 'pln_rough_cut.json'));

    const episode = await readFile(path.join(projectRoot, 'episode.md'), 'utf8');
    expect(episode).toContain('# 第 24 期 本地优先');
  });

  it('imports an audio file by copying it into the project library and updating assets.json', async () => {
    const settings = createSettings(tempDir);
    const project = await createProject(settings, { title: '第 24 期 本地优先' });
    const sourcePath = path.join(tempDir, 'outside-recording.wav');
    await writeFile(sourcePath, Buffer.from('fake audio data'));

    const asset = await importLibraryAsset(settings, {
      projectId: project.id,
      sourcePath,
      kind: 'audio'
    });

    const copiedPath = path.join(tempDir, 'library', 'projects', project.slug, asset.libraryPath);
    await expectFile(copiedPath);
    expect(await readFile(copiedPath, 'utf8')).toBe('fake audio data');
    expect(asset.originalPath).toBe(sourcePath);
    expect(asset.originalFileName).toBe('outside-recording.wav');
    expect(asset.kind).toBe('audio');
    expect(asset.sha256).toMatch(/^[a-f0-9]{64}$/);

    const assetsIndex = JSON.parse(
      await readFile(path.join(tempDir, 'library', 'projects', project.slug, 'assets.json'), 'utf8')
    ) as { assets: Array<{ id: string }> };
    expect(assetsIndex.assets).toHaveLength(1);
    expect(assetsIndex.assets[0]?.id).toBe(asset.id);

    const refreshedWorkspace = await ensureWorkspace(settings);
    expect(refreshedWorkspace.projects.find((item) => item.id === project.id)?.assetCount).toBe(1);
  });

  it('applies a pending markdown append intent with a document version snapshot', async () => {
    const settings = createSettings(tempDir);
    const project = await createProject(settings, { title: '第 24 期 本地优先' });
    const projectRoot = path.join(tempDir, project.projectPath);
    const episodePath = path.join(projectRoot, 'episode.md');
    const originalEpisode = await readFile(episodePath, 'utf8');

    const intent = await createMarkdownAppendIntent(settings, {
      projectId: project.id,
      markdown: '\n## 资料补充\n\n这里是一段核实后的资料。\n',
      summary: '追加资料补充段落'
    });

    await expectFile(path.join(projectRoot, '.podcast-artist', 'write-journal', 'pending', `${intent.id}.json`));

    const result = await applyPendingWriteIntents(settings, project.id);

    expect(result.applied).toBe(1);
    expect(result.failed).toBe(0);
    expect(await readFile(episodePath, 'utf8')).toContain('这里是一段核实后的资料。');
    await expectMissing(path.join(projectRoot, '.podcast-artist', 'write-journal', 'pending', `${intent.id}.json`));

    const appliedIntent = JSON.parse(
      await readFile(path.join(projectRoot, '.podcast-artist', 'write-journal', 'applied', `${intent.id}.json`), 'utf8')
    ) as { status: string; appliedAt: string | null };
    expect(appliedIntent.status).toBe('applied');
    expect(appliedIntent.appliedAt).toEqual(expect.any(String));

    const versionDirs = await readdir(path.join(projectRoot, '.podcast-artist', 'document-versions', 'episode'));
    expect(versionDirs).toHaveLength(1);
    const versionRoot = path.join(projectRoot, '.podcast-artist', 'document-versions', 'episode', versionDirs[0]);
    expect(await readFile(path.join(versionRoot, 'episode.md'), 'utf8')).toBe(originalEpisode);

    const versionMeta = JSON.parse(await readFile(path.join(versionRoot, 'meta.json'), 'utf8')) as {
      nextIntentId: string;
      retentionUntil: string;
    };
    expect(versionMeta.nextIntentId).toBe(intent.id);
    expect(versionMeta.retentionUntil).toEqual(expect.any(String));
  });

  it('fails a markdown write intent without overwriting externally changed content', async () => {
    const settings = createSettings(tempDir);
    const project = await createProject(settings, { title: '第 24 期 本地优先' });
    const projectRoot = path.join(tempDir, project.projectPath);
    const episodePath = path.join(projectRoot, 'episode.md');

    const intent = await createMarkdownAppendIntent(settings, {
      projectId: project.id,
      markdown: '\n## 这段不应该被写入\n',
      summary: '尝试追加过期内容'
    });
    await writeFile(episodePath, '# 外部编辑器已经改过\n\n', 'utf8');

    const result = await applyPendingWriteIntents(settings, project.id);

    expect(result.applied).toBe(0);
    expect(result.failed).toBe(1);
    expect(await readFile(episodePath, 'utf8')).toBe('# 外部编辑器已经改过\n\n');

    const failedIntent = JSON.parse(
      await readFile(path.join(projectRoot, '.podcast-artist', 'write-journal', 'failed', `${intent.id}.json`), 'utf8')
    ) as { status: string; error: string | null };
    expect(failedIntent.status).toBe('failed');
    expect(failedIntent.error).toContain('base hash');

    const versionDirs = await readdir(path.join(projectRoot, '.podcast-artist', 'document-versions', 'episode'));
    expect(versionDirs).toHaveLength(0);
  });

  it('creates a research task ledger and can append the task result through the write journal', async () => {
    const settings = createSettings(tempDir);
    const project = await createProject(settings, { title: '第 24 期 本地优先' });
    const projectRoot = path.join(tempDir, project.projectPath);

    const task = await createResearchTask(settings, {
      projectId: project.id,
      userPrompt: '核实这一段说法',
      contextMarkdown: '用户正在查看：本地优先工具为什么重要。',
      resultMarkdown: '## 资料补充\n\n本地优先可以降低长期维护成本。',
      title: '本地优先资料核实'
    });

    const taskRoot = path.join(projectRoot, '.podcast-artist', 'tasks', task.id);
    await expectFile(path.join(taskRoot, 'task.json'));
    expect(await readFile(path.join(taskRoot, 'context.md'), 'utf8')).toContain('用户正在查看');
    expect(await readFile(path.join(taskRoot, 'result.md'), 'utf8')).toContain('本地优先可以降低长期维护成本');

    const appendResult = await appendTaskResultToDocument(settings, {
      projectId: project.id,
      taskId: task.id,
      summary: '采纳资料任务结果'
    });

    expect(appendResult.applyResult.applied).toBe(1);
    expect(appendResult.intent.sourceTaskId).toBe(task.id);
    expect(appendResult.document.content).toContain('本地优先可以降低长期维护成本');
  });

  it('lists imported project assets and updates the non-destructive edit plan with ripple delete', async () => {
    const settings = createSettings(tempDir);
    const project = await createProject(settings, { title: '第 24 期 本地优先' });
    const projectRoot = path.join(tempDir, project.projectPath);
    const hostSourcePath = path.join(tempDir, 'host.wav');
    const guestSourcePath = path.join(tempDir, 'guest.wav');
    await writeFile(hostSourcePath, Buffer.from('host audio data'));
    await writeFile(guestSourcePath, Buffer.from('guest audio data'));
    const hostAsset = await importLibraryAsset(settings, { projectId: project.id, sourcePath: hostSourcePath, kind: 'audio' });
    const guestAsset = await importLibraryAsset(settings, { projectId: project.id, sourcePath: guestSourcePath, kind: 'audio' });

    const library = await readProjectLibrary(settings, project.id);
    expect(library.assets.map((asset) => asset.id)).toEqual([hostAsset.id, guestAsset.id]);

    const firstClip = await addAudioClipToEditPlan(settings, {
      projectId: project.id,
      assetId: hostAsset.id,
      trackName: 'Voice',
      sourceStartMs: 0,
      sourceEndMs: 1000
    });
    const secondClip = await addAudioClipToEditPlan(settings, {
      projectId: project.id,
      assetId: guestAsset.id,
      trackName: 'Voice',
      sourceStartMs: 0,
      sourceEndMs: 2000
    });

    const plan = await readAudioEditPlan(settings, project.id);
    expect(plan.tracks).toHaveLength(1);
    expect(plan.clips.map((clip) => clip.timelineStartMs)).toEqual([0, 1000]);

    const nextPlan = await rippleDeleteAudioClip(settings, {
      projectId: project.id,
      clipId: firstClip.id
    });

    expect(nextPlan.clips).toHaveLength(1);
    expect(nextPlan.clips[0]?.id).toBe(secondClip.id);
    expect(nextPlan.clips[0]?.timelineStartMs).toBe(0);
    expect(await readFile(path.join(tempDir, 'library', 'projects', project.slug, hostAsset.libraryPath), 'utf8')).toBe('host audio data');
    await expectFile(path.join(projectRoot, '.podcast-artist', 'edit-plans', 'pln_rough_cut.json'));
  });

  it('updates clip timing and ripples later clips on the same track', async () => {
    const settings = createSettings(tempDir);
    const project = await createProject(settings, { title: 'Clip timing' });
    const sourcePath = path.join(tempDir, 'host.wav');
    await writeFile(sourcePath, Buffer.from('host audio data'));
    const asset = await importLibraryAsset(settings, { projectId: project.id, sourcePath, kind: 'audio' });

    const firstClip = await addAudioClipToEditPlan(settings, {
      projectId: project.id,
      assetId: asset.id,
      trackName: 'Voice',
      sourceStartMs: 0,
      sourceEndMs: 1000
    });
    const middleClip = await addAudioClipToEditPlan(settings, {
      projectId: project.id,
      assetId: asset.id,
      trackName: 'Voice',
      sourceStartMs: 1000,
      sourceEndMs: 3000
    });
    const lastClip = await addAudioClipToEditPlan(settings, {
      projectId: project.id,
      assetId: asset.id,
      trackName: 'Voice',
      sourceStartMs: 3000,
      sourceEndMs: 4000
    });

    const nextPlan = await updateAudioClipTiming(settings, {
      projectId: project.id,
      clipId: middleClip.id,
      sourceStartMs: 1200,
      sourceEndMs: 2500
    });

    expect(nextPlan.clips.find((clip) => clip.id === firstClip.id)?.timelineStartMs).toBe(0);
    expect(nextPlan.clips.find((clip) => clip.id === middleClip.id)).toMatchObject({
      sourceStartMs: 1200,
      sourceEndMs: 2500,
      timelineStartMs: 1000
    });
    expect(nextPlan.clips.find((clip) => clip.id === lastClip.id)?.timelineStartMs).toBe(2300);
  });

  it('builds ffmpeg render arguments from sequential edit plan clips', () => {
    const args = buildFfmpegRenderArgs({
      clips: [
        {
          inputPath: '/tmp/host.wav',
          sourceStartMs: 0,
          sourceEndMs: 1000,
          gainDb: 0,
          fadeInMs: 20,
          fadeOutMs: 20
        },
        {
          inputPath: '/tmp/guest.wav',
          sourceStartMs: 250,
          sourceEndMs: 2250,
          gainDb: -3,
          fadeInMs: 10,
          fadeOutMs: 30
        }
      ],
      sampleRate: 48000,
      channels: 2,
      loudnessTargetLufs: -16,
      outputPath: '/tmp/master.wav'
    });

    expect(args).toEqual([
      '-y',
      '-ss',
      '0.000',
      '-t',
      '1.000',
      '-i',
      '/tmp/host.wav',
      '-ss',
      '0.250',
      '-t',
      '2.000',
      '-i',
      '/tmp/guest.wav',
      '-filter_complex',
      '[0:a]asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.020,afade=t=out:st=0.980:d=0.020[a0];[1:a]asetpts=PTS-STARTPTS,volume=-3dB,afade=t=in:st=0:d=0.010,afade=t=out:st=1.970:d=0.030[a1];[a0][a1]concat=n=2:v=0:a=1,loudnorm=I=-16:TP=-1.5:LRA=11[out]',
      '-map',
      '[out]',
      '-ar',
      '48000',
      '-ac',
      '2',
      '/tmp/master.wav'
    ]);
  });

  it('exports an edit plan through ffmpeg and records a render job', async () => {
    const fakeFfmpegPath = path.join(tempDir, 'fake-ffmpeg.sh');
    await writeFile(
      fakeFfmpegPath,
      '#!/bin/sh\nlast=""\nfor arg in "$@"; do last="$arg"; done\nmkdir -p "$(dirname "$last")"\nprintf "rendered audio" > "$last"\n',
      'utf8'
    );
    await chmod(fakeFfmpegPath, 0o755);
    const settings = createSettings(tempDir);
    settings.tools.ffmpeg.path = fakeFfmpegPath;
    const project = await createProject(settings, { title: '第 24 期 本地优先' });
    const projectRoot = path.join(tempDir, project.projectPath);
    const sourcePath = path.join(tempDir, 'host.wav');
    await writeFile(sourcePath, Buffer.from('host audio data'));
    const asset = await importLibraryAsset(settings, { projectId: project.id, sourcePath, kind: 'audio' });
    await addAudioClipToEditPlan(settings, {
      projectId: project.id,
      assetId: asset.id,
      trackName: 'Voice',
      sourceStartMs: 0,
      sourceEndMs: 1000
    });

    const job = await exportAudioEditPlan(settings, { projectId: project.id });

    expect(job.status).toBe('completed');
    expect(job.outputPath).toMatch(/^exports\//);
    expect(await readFile(path.join(projectRoot, job.outputPath), 'utf8')).toBe('rendered audio');
    await expectFile(path.join(projectRoot, '.podcast-artist', 'renders', `${job.id}.json`));
  });

  it('analyzes an audio asset with ffprobe and records readable analysis metadata', async () => {
    const fakeFfprobePath = path.join(tempDir, 'fake-ffprobe.js');
    await writeFile(
      fakeFfprobePath,
      '#!/usr/bin/env node\nconsole.log(JSON.stringify({format:{duration:"12.345",bit_rate:"192000"},streams:[{codec_type:"audio",codec_name:"pcm_s16le",sample_rate:"48000",channels:2}]}));\n',
      'utf8'
    );
    await chmod(fakeFfprobePath, 0o755);
    const settings = createSettings(tempDir);
    settings.tools.ffprobe.path = fakeFfprobePath;
    const project = await createProject(settings, { title: '第 24 期 本地优先' });
    const projectRoot = path.join(tempDir, project.projectPath);
    const sourcePath = path.join(tempDir, 'host.wav');
    await writeFile(sourcePath, Buffer.from('host audio data'));
    const asset = await importLibraryAsset(settings, { projectId: project.id, sourcePath, kind: 'audio' });

    const analysis = await analyzeAudioAsset(settings, { projectId: project.id, assetId: asset.id });

    expect(analysis.durationMs).toBe(12345);
    expect(analysis.sampleRate).toBe(48000);
    expect(analysis.channels).toBe(2);
    expect(analysis.codecName).toBe('pcm_s16le');
    await expectFile(path.join(projectRoot, '.podcast-artist', 'audio-cache', 'analysis', `${asset.id}.json`));

    const library = await readProjectLibrary(settings, project.id);
    expect(library.assets[0]?.metadata.audio).toMatchObject({
      durationMs: 12345,
      sampleRate: 48000,
      channels: 2,
      codecName: 'pcm_s16le'
    });
  });

  it('generates proxy audio and peaks cache without modifying the library asset copy', async () => {
    const fakeFfmpegPath = path.join(tempDir, 'fake-ffmpeg.js');
    await writeFile(
      fakeFfmpegPath,
      [
        '#!/usr/bin/env node',
        'import { mkdirSync, writeFileSync } from "node:fs";',
        'import path from "node:path";',
        'const args = process.argv.slice(2);',
        'if (args.at(-1) === "-") {',
        '  const buffer = Buffer.alloc(16);',
        '  [0.25, -0.5, 0.75, -1].forEach((value, index) => buffer.writeFloatLE(value, index * 4));',
        '  process.stdout.write(buffer);',
        '} else {',
        '  const output = args.at(-1);',
        '  mkdirSync(path.dirname(output), { recursive: true });',
        '  writeFileSync(output, "proxy audio");',
        '}'
      ].join('\n'),
      'utf8'
    );
    await chmod(fakeFfmpegPath, 0o755);
    const settings = createSettings(tempDir);
    settings.tools.ffmpeg.path = fakeFfmpegPath;
    const project = await createProject(settings, { title: '第 24 期 本地优先' });
    const projectRoot = path.join(tempDir, project.projectPath);
    const sourcePath = path.join(tempDir, 'host.wav');
    await writeFile(sourcePath, Buffer.from('host audio data'));
    const asset = await importLibraryAsset(settings, { projectId: project.id, sourcePath, kind: 'audio' });

    const proxy = await generateAudioProxy(settings, { projectId: project.id, assetId: asset.id });
    const peaks = await generateAudioPeaks(settings, { projectId: project.id, assetId: asset.id, pointsPerSecond: 2 });

    expect(proxy.proxyPath).toBe(`.podcast-artist/audio-cache/proxy/${asset.id}.wav`);
    expect(await readFile(path.join(projectRoot, proxy.proxyPath), 'utf8')).toBe('proxy audio');
    expect(peaks.peaks).toEqual([0.25, 0.5, 0.75, 1]);
    await expectFile(path.join(projectRoot, '.podcast-artist', 'audio-cache', 'peaks', `${asset.id}.json`));
    expect(await readFile(path.join(tempDir, 'library', 'projects', project.slug, asset.libraryPath), 'utf8')).toBe('host audio data');
  });

  it('returns playback data for the project library asset using generated proxy and peaks', async () => {
    const fakeFfmpegPath = path.join(tempDir, 'fake-ffmpeg.js');
    await writeFile(
      fakeFfmpegPath,
      [
        '#!/usr/bin/env node',
        'import { mkdirSync, writeFileSync } from "node:fs";',
        'import path from "node:path";',
        'const args = process.argv.slice(2);',
        'if (args.at(-1) === "-") {',
        '  const buffer = Buffer.alloc(16);',
        '  [0.25, -0.5, 0.75, -1].forEach((value, index) => buffer.writeFloatLE(value, index * 4));',
        '  process.stdout.write(buffer);',
        '} else {',
        '  const output = args.at(-1);',
        '  mkdirSync(path.dirname(output), { recursive: true });',
        '  writeFileSync(output, "proxy audio");',
        '}'
      ].join('\n'),
      'utf8'
    );
    await chmod(fakeFfmpegPath, 0o755);
    const settings = createSettings(tempDir);
    settings.tools.ffmpeg.path = fakeFfmpegPath;
    const project = await createProject(settings, { title: 'Playback Data' });
    const sourcePath = path.join(tempDir, 'outside-recording.wav');
    await writeFile(sourcePath, Buffer.from('host audio data'));
    const asset = await importLibraryAsset(settings, { projectId: project.id, sourcePath, kind: 'audio' });

    await generateAudioProxy(settings, { projectId: project.id, assetId: asset.id });
    await generateAudioPeaks(settings, { projectId: project.id, assetId: asset.id, pointsPerSecond: 2 });

    const playbackData = await readAudioAssetPlaybackData(settings, { projectId: project.id, assetId: asset.id });

    expect(playbackData.schemaVersion).toBe('audioAssetPlayback.v1');
    expect(playbackData.sourceUrl).toMatch(/^file:/);
    expect(playbackData.proxyUrl).toMatch(/^file:/);
    expect(playbackData.preferredUrl).toBe(playbackData.proxyUrl);
    expect(playbackData.peaks?.peaks).toEqual([0.25, 0.5, 0.75, 1]);
    expect(playbackData.durationMs).toBe(2000);
    expect(playbackData.sourceUrl).toContain('/library/projects/');
    expect(playbackData.sourceUrl).toContain('/assets/audio/');
  });
});

function createSettings(workspacePath: string): AppSettings {
  return {
    schemaVersion: 'appSettings.v1',
    workspacePath,
    defaultProviderProfileId: null,
    defaultTranscriptionProfileId: null,
    tools: {
      ffmpeg: {
        path: null,
        autoDetect: true
      },
      ffprobe: {
        path: null,
        autoDetect: true
      },
      whisperCpp: {
        path: null,
        modelDirectory: null,
        defaultModelPath: null,
        autoDetect: true
      }
    }
  };
}

async function expectFile(filePath: string): Promise<void> {
  await expect(stat(filePath)).resolves.toBeTruthy();
}

async function expectMissing(filePath: string): Promise<void> {
  await expect(access(filePath)).rejects.toMatchObject({ code: 'ENOENT' });
}
