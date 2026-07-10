const DENIED_PATH_SEGMENTS = new Set([
  'node_modules',
  'dist',
  '.git',
  'vendor',
  'coverage',
  'build',
  '.next',
  '.turbo',
]);

const DENIED_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.svg',
  '.bmp',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.otf',
  '.zip',
  '.tar',
  '.gz',
  '.tgz',
  '.7z',
  '.rar',
  '.pdf',
  '.bin',
  '.exe',
  '.dll',
  '.so',
  '.dylib',
  '.class',
  '.jar',
  '.wasm',
  '.mp3',
  '.mp4',
  '.mov',
  '.avi',
  '.db',
  '.sqlite',
  '.sqlite3',
  '.min.js',
  '.min.css',
  '.map',
  '.lock',
]);

const LOCKFILE_NAMES = new Set(['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock']);

const TEXT_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
  '.yaml',
  '.yml',
  '.md',
  '.mdx',
  '.txt',
  '.sql',
  '.sh',
  '.bash',
  '.zsh',
  '.py',
  '.rb',
  '.go',
  '.rs',
  '.java',
  '.kt',
  '.swift',
  '.cs',
  '.cpp',
  '.c',
  '.h',
  '.hpp',
  '.html',
  '.htm',
  '.css',
  '.scss',
  '.sass',
  '.less',
  '.xml',
  '.toml',
  '.ini',
  '.env.example',
  '.graphql',
  '.gql',
  '.dockerfile',
  '.tf',
  '.vue',
  '.svelte',
]);

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.json': 'json',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.md': 'markdown',
  '.mdx': 'markdown',
  '.sql': 'sql',
  '.sh': 'shell',
  '.bash': 'shell',
  '.zsh': 'shell',
  '.py': 'python',
  '.rb': 'ruby',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
  '.kt': 'kotlin',
  '.swift': 'swift',
  '.cs': 'csharp',
  '.cpp': 'cpp',
  '.c': 'c',
  '.h': 'c',
  '.hpp': 'cpp',
  '.html': 'html',
  '.htm': 'html',
  '.css': 'css',
  '.scss': 'scss',
  '.sass': 'sass',
  '.less': 'less',
  '.xml': 'xml',
  '.toml': 'toml',
  '.ini': 'ini',
  '.graphql': 'graphql',
  '.gql': 'graphql',
  '.vue': 'vue',
  '.svelte': 'svelte',
};

function extensionOf(path: string): string {
  const base = path.split('/').pop() ?? path;
  const dot = base.lastIndexOf('.');
  if (dot <= 0) {
    return '';
  }
  return base.slice(dot).toLowerCase();
}

function baseName(path: string): string {
  return path.split('/').pop() ?? path;
}

export function isDeniedSecretBasename(path: string): boolean {
  const name = baseName(path).toLowerCase();
  if (name === '.env' || name === '.env.local' || name === '.env.development' || name === '.env.production') {
    return true;
  }
  return name.startsWith('.env.');
}

export function hasDeniedPathSegment(path: string): boolean {
  const segments = path.split('/').filter(Boolean);
  return segments.some((segment) => DENIED_PATH_SEGMENTS.has(segment));
}

export function isDeniedExtension(path: string): boolean {
  const extension = extensionOf(path);
  if (extension && DENIED_EXTENSIONS.has(extension)) {
    return true;
  }
  return LOCKFILE_NAMES.has(baseName(path));
}

export function isTextSourcePath(path: string): boolean {
  const extension = extensionOf(path);
  if (extension && TEXT_EXTENSIONS.has(extension)) {
    return true;
  }
  const name = baseName(path).toLowerCase();
  if (name === 'dockerfile' || name === 'makefile' || name === 'license' || name === 'readme') {
    return true;
  }
  return false;
}

export function looksLikeTextContent(content: string): boolean {
  if (!content) {
    return false;
  }
  const sample = content.slice(0, 4096);
  let controlChars = 0;
  for (const char of sample) {
    const code = char.charCodeAt(0);
    if (code === 0) {
      return false;
    }
    if (code < 9 || (code > 13 && code < 32)) {
      controlChars += 1;
    }
  }
  return controlChars / sample.length < 0.05;
}

export function shouldCrawlSourceFile(path: string, content: string): boolean {
  if (isDeniedSecretBasename(path) || hasDeniedPathSegment(path) || isDeniedExtension(path)) {
    return false;
  }
  if (isTextSourcePath(path)) {
    return looksLikeTextContent(content);
  }
  return looksLikeTextContent(content);
}

export function detectLanguage(path: string): string | null {
  const extension = extensionOf(path);
  if (extension && LANGUAGE_BY_EXTENSION[extension]) {
    return LANGUAGE_BY_EXTENSION[extension] ?? null;
  }
  const name = baseName(path).toLowerCase();
  if (name === 'dockerfile') {
    return 'dockerfile';
  }
  if (name === 'makefile') {
    return 'makefile';
  }
  return null;
}

export function contentByteLength(content: string): number {
  return Buffer.byteLength(content, 'utf8');
}
