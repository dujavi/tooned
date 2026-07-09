export type SyncStatus = 'idle' | 'syncing' | 'error';

export interface SyncMeta {
  lastSync: string | null;
  dataAgeSeconds: number | null;
  syncStatus: SyncStatus;
}

export interface Story {
  key: string;
  summary: string;
  status: string;
  team?: string;
  syncedAt?: string;
}

export type VcsProvider = 'bitbucket' | 'github';

export interface VcsPullRequest {
  id: string;
  title: string;
  repository: string;
  headSha: string;
  url: string;
}

export interface VcsDiffstat {
  filesChanged: number;
  linesAdded: number;
  linesRemoved: number;
}

export interface VcsCommit {
  hash: string;
  repository: string;
  message: string;
  author: string | null;
  authoredAt: string | null;
  url: string;
  pullRequestUrl: string | null;
  diffstat: VcsDiffstat | null;
}

export interface VcsClient {
  readonly provider: VcsProvider;
  getPullRequest(input: { repository: string; id: number }): Promise<VcsPullRequest>;
  getCommit(input: { repository: string; hash: string }): Promise<VcsCommit>;
  resolveShortSha(input: { repository: string; shortSha: string }): Promise<string | null>;
  getDiffstat(input: { repository: string; hash: string }): Promise<VcsDiffstat | null>;
}
