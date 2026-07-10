export type RefDomain = 'confluence' | 'bitbucket' | 'github' | 'form' | 'jira' | 'other';

export interface ExtractedRef {
  url: string;
  domain: RefDomain;
}

export interface DomainConfig {
  form: string[];
  confluence: string[];
}

const URL_REGEX = /\bhttps?:\/\/[^\s<>)\]]+/gi;

function normalizeHost(host: string): string {
  return host.trim().toLowerCase();
}

function hostMatches(host: string, configuredHosts: string[]): boolean {
  return configuredHosts.map(normalizeHost).includes(normalizeHost(host));
}

export type ConfluenceUrlKind = 'page' | 'tiny' | 'draft' | 'folder' | 'unknown';

export interface ParsedConfluenceUrl {
  normalizedUrl: string;
  pageId: string | null;
  kind: ConfluenceUrlKind;
  tinyId?: string;
  draftId?: string;
  spaceKey?: string;
}

export function normalizeConfluenceUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.delete('atlOrigin');
    const normalized = parsed.toString();
    return normalized.endsWith('?') ? normalized.slice(0, -1) : normalized;
  } catch {
    return url;
  }
}

export function parseConfluenceUrl(url: string): ParsedConfluenceUrl | null {
  const normalizedUrl = normalizeConfluenceUrl(url);
  let parsed: URL;
  try {
    parsed = new URL(normalizedUrl);
  } catch {
    return null;
  }

  if (!parsed.pathname.includes('/wiki/')) {
    return null;
  }

  const folderMatch = parsed.pathname.match(/\/wiki\/spaces\/([^/]+)\/folder\/([^/]+)/i);
  if (folderMatch) {
    return {
      normalizedUrl,
      pageId: null,
      kind: 'folder',
      spaceKey: folderMatch[1],
    };
  }

  const draftId = parsed.searchParams.get('draftId');
  if (parsed.pathname.includes('/pages/resumedraft.action') && draftId) {
    return {
      normalizedUrl,
      pageId: draftId,
      kind: 'draft',
      draftId,
    };
  }

  const tinyMatch = parsed.pathname.match(/\/wiki\/x\/([^/]+)/i);
  if (tinyMatch) {
    return {
      normalizedUrl,
      pageId: null,
      kind: 'tiny',
      tinyId: tinyMatch[1],
    };
  }

  const pageMatch = parsed.pathname.match(/\/wiki\/spaces\/([^/]+)\/pages\/(\d+)/i);
  if (pageMatch) {
    return {
      normalizedUrl,
      pageId: pageMatch[2] ?? null,
      kind: 'page',
      spaceKey: pageMatch[1],
    };
  }

  return {
    normalizedUrl,
    pageId: null,
    kind: 'unknown',
  };
}

function classifyDomain(url: URL, domainConfig: DomainConfig): RefDomain {
  const host = normalizeHost(url.hostname);
  if (url.pathname.includes('/wiki/')) return 'confluence';
  if (host.includes('atlassian.net') || host.includes('jira')) return 'jira';
  if (host.includes('bitbucket')) return 'bitbucket';
  if (host.includes('github')) return 'github';
  if (hostMatches(host, domainConfig.confluence)) return 'confluence';
  if (hostMatches(host, domainConfig.form)) return 'form';
  return 'other';
}

export function extractUrlsFromMarkdown(markdown: string): string[] {
  const urls = new Set<string>();
  for (const match of markdown.matchAll(URL_REGEX)) {
    const value = match[0].replace(/[),.;]+$/, '');
    urls.add(value);
  }
  return [...urls];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function collectAdfLinks(node: unknown, bucket: Set<string>): void {
  if (!isRecord(node)) return;
  const marks = Array.isArray(node.marks) ? node.marks : [];
  for (const mark of marks) {
    if (
      isRecord(mark) &&
      mark.type === 'link' &&
      isRecord(mark.attrs) &&
      typeof mark.attrs.href === 'string'
    ) {
      bucket.add(mark.attrs.href);
    }
  }
  if (node.type === 'inlineCard' && isRecord(node.attrs) && typeof node.attrs.url === 'string') {
    bucket.add(node.attrs.url);
  }
  if (Array.isArray(node.content)) {
    for (const child of node.content) {
      collectAdfLinks(child, bucket);
    }
  }
}

export function extractUrlsFromAdf(adf: unknown): string[] {
  const urls = new Set<string>();
  collectAdfLinks(adf, urls);
  return [...urls];
}

export function extractTaggedRefs(input: {
  markdown?: string;
  adf?: unknown;
  urlDomains: DomainConfig;
}): ExtractedRef[] {
  const urls = new Set<string>();
  for (const value of extractUrlsFromMarkdown(input.markdown ?? '')) {
    urls.add(value);
  }
  for (const value of extractUrlsFromAdf(input.adf)) {
    urls.add(value);
  }

  const refs: ExtractedRef[] = [];
  for (const value of urls) {
    try {
      const parsed = new URL(value);
      refs.push({
        url: value,
        domain: classifyDomain(parsed, input.urlDomains),
      });
    } catch {
      refs.push({
        url: value,
        domain: 'other',
      });
    }
  }

  return refs;
}
