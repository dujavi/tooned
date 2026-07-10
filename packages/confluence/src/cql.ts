export type ConfluenceCrawlMode = 'all' | 'spaces';

export function buildCrawlCql(mode: ConfluenceCrawlMode, spaces: string[]): string {
  const clauses = ['type=page'];
  if (mode === 'spaces' && spaces.length > 0) {
    const quoted = spaces.map((space) => `"${space.replace(/"/g, '\\"')}"`).join(', ');
    clauses.push(`space in (${quoted})`);
  }
  return clauses.join(' and ');
}
