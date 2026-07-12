import type { AgentTask, AppSettings, CreateResearchTaskInput, ProviderProfilesFile } from '../../shared/types';
import { requestResearchMarkdown, type ResearchProviderRequest } from './openAiCompatibleProvider';
import { completeResearchTask, createResearchTask, failResearchTask } from './workspace';

export type ResearchRequester = (input: ResearchProviderRequest) => Promise<string>;

export async function startResearchTask(
  settings: AppSettings,
  providers: ProviderProfilesFile,
  input: CreateResearchTaskInput,
  request: ResearchRequester = requestResearchMarkdown
): Promise<{ task: AgentTask; completion: Promise<AgentTask> }> {
  const profileId = input.providerProfileId ?? settings.defaultProviderProfileId;
  const profile = providers.profiles.find((item) => item.id === profileId);
  if (!profile) throw new Error('A valid research provider profile is required.');

  const task = await createResearchTask(settings, { ...input, providerProfileId: profile.id }, profile.kind);
  const completion = request({ profile, prompt: input.userPrompt, contextMarkdown: input.contextMarkdown })
    .then((resultMarkdown) => completeResearchTask(settings, {
      projectId: input.projectId,
      taskId: task.id,
      resultMarkdown
    }))
    .catch((error) => failResearchTask(settings, {
      projectId: input.projectId,
      taskId: task.id,
      error: error instanceof Error ? error.message : String(error)
    }));
  return { task, completion };
}
