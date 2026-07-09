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

function classifyDomain(url: URL, domainConfig: DomainConfig): RefDomain {
  const host = normalizeHost(url.hostname);
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
