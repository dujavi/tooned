export interface AdfNode {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: Array<{ type?: string; attrs?: Record<string, unknown> }>;
  content?: AdfNode[];
}

export interface AdfDocument {
  type?: string;
  content?: AdfNode[];
}

function normalizeInline(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function textWithMarks(node: AdfNode): string {
  const rawText = node.text ?? '';
  if (!node.marks || node.marks.length === 0) {
    return rawText;
  }

  return node.marks.reduce((acc, mark) => {
    if (mark.type === 'strong') return `**${acc}**`;
    if (mark.type === 'em') return `*${acc}*`;
    if (mark.type === 'code') return `\`${acc}\``;
    if (mark.type === 'link') {
      const href = typeof mark.attrs?.href === 'string' ? mark.attrs.href : '';
      if (href.length > 0) {
        return `[${acc}](${href})`;
      }
    }
    return acc;
  }, rawText);
}

function renderInline(nodes: AdfNode[] | undefined): string {
  if (!nodes || nodes.length === 0) {
    return '';
  }

  const text = nodes
    .map((node) => renderNode(node, 0, false))
    .join('')
    .replace(/\n+/g, ' ');
  return normalizeInline(text);
}

function renderList(nodes: AdfNode[] | undefined, depth: number, ordered: boolean): string {
  if (!nodes || nodes.length === 0) {
    return '';
  }
  const prefix = ordered ? '1.' : '-';
  const indent = '  '.repeat(depth);

  return nodes
    .map((node) => {
      const line = renderInline(node.content);
      if (!line) return '';
      return `${indent}${prefix} ${line}`;
    })
    .filter(Boolean)
    .join('\n');
}

function renderNode(node: AdfNode, depth: number, inCodeBlock: boolean): string {
  switch (node.type) {
    case 'text':
      return inCodeBlock ? node.text ?? '' : textWithMarks(node);
    case 'hardBreak':
      return '\n';
    case 'mention': {
      const text = typeof node.attrs?.text === 'string' ? node.attrs.text : '';
      const id = typeof node.attrs?.id === 'string' ? node.attrs.id : '';
      return text || id ? `@${text || id}` : '';
    }
    case 'inlineCard': {
      const url = typeof node.attrs?.url === 'string' ? node.attrs.url : '';
      return url.length > 0 ? url : '';
    }
    case 'paragraph':
      return `${renderInline(node.content)}\n\n`;
    case 'heading': {
      const level = Math.max(1, Math.min(6, Number(node.attrs?.level ?? 2)));
      const content = renderInline(node.content);
      return `${'#'.repeat(level)} ${content}\n\n`;
    }
    case 'bulletList':
      return `${renderList(node.content, depth, false)}\n\n`;
    case 'orderedList':
      return `${renderList(node.content, depth, true)}\n\n`;
    case 'listItem':
      return renderInline(node.content);
    case 'codeBlock': {
      const text = (node.content ?? [])
        .map((child) => renderNode(child, depth + 1, true))
        .join('');
      return `\`\`\`\n${text}\n\`\`\`\n\n`;
    }
    case 'blockquote': {
      const text = renderInline(node.content);
      return `> ${text}\n\n`;
    }
    case 'doc':
      return (node.content ?? []).map((child) => renderNode(child, depth, false)).join('');
    default:
      return renderInline(node.content);
  }
}

export function adfToMarkdown(input: unknown): string {
  if (!input) {
    return '';
  }
  if (typeof input !== 'object') {
    return '';
  }
  const root: AdfNode = 'content' in input ? (input as AdfNode) : { type: 'doc', content: [] };
  return renderNode(root, 0, false).replace(/\n{3,}/g, '\n\n').trim();
}
