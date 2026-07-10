function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function stripTags(value: string): string {
  return decodeEntities(value.replace(/[<>]/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function replaceAll(input: string, pattern: RegExp, replacer: (match: RegExpExecArray) => string): string {
  let result = input;
  let match: RegExpExecArray | null;
  const globalPattern = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
  while ((match = globalPattern.exec(result)) !== null) {
    const replacement = replacer(match);
    result = `${result.slice(0, match.index)}${replacement}${result.slice(match.index + match[0].length)}`;
    if (match[0].length === 0) {
      globalPattern.lastIndex += 1;
    }
  }
  return result;
}

function convertHeadings(html: string): string {
  return replaceAll(html, /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (match) => {
    const level = Number(match[1]);
    const text = stripTags(match[2] ?? '');
    return text ? `${'#'.repeat(level)} ${text}\n\n` : '';
  });
}

function convertLinks(html: string): string {
  return replaceAll(html, /<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (match) => {
    const href = match[1] ?? '';
    const text = stripTags(match[2] ?? '') || href;
    return `[${text}](${href})`;
  });
}

function convertCodeBlocks(html: string): string {
  let result = replaceAll(
    html,
    /<ac:structured-macro[^>]*ac:name="code"[^>]*>[\s\S]*?<ac:plain-text-body><!\[CDATA\[([\s\S]*?)\]\]><\/ac:plain-text-body>[\s\S]*?<\/ac:structured-macro>/gi,
    (match) => `\n\`\`\`\n${match[1] ?? ''}\n\`\`\`\n\n`,
  );
  result = replaceAll(result, /<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, (match) => {
    return `\n\`\`\`\n${stripTags(match[1] ?? '')}\n\`\`\`\n\n`;
  });
  return result;
}

function convertLists(html: string): string {
  let result = html.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_match, content: string) => {
    const text = stripTags(content ?? '');
    return text ? `- ${text}\n` : '';
  });
  result = result.replace(/<\/?[uo]l[^>]*>/gi, '\n');
  return result;
}

function convertTables(html: string): string {
  return replaceAll(html, /<table[^>]*>([\s\S]*?)<\/table>/gi, (match) => {
    const rows = [...(match[1] ?? '').matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
    const lines = rows.map((row) => {
      const cells = [...(row[1] ?? '').matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((cell) =>
        stripTags(cell[1] ?? '').replace(/\|/g, '\\|'),
      );
      return cells.length > 0 ? `| ${cells.join(' | ')} |` : '';
    });
    return lines.filter(Boolean).length > 0 ? `\n${lines.filter(Boolean).join('\n')}\n\n` : '';
  });
}

function convertParagraphs(html: string): string {
  return replaceAll(html, /<p[^>]*>([\s\S]*?)<\/p>/gi, (match) => {
    const text = stripTags(match[1] ?? '');
    return text ? `${text}\n\n` : '';
  });
}

function convertInlineFormatting(html: string): string {
  let result = html;
  result = replaceAll(result, /<strong[^>]*>([\s\S]*?)<\/strong>/gi, (match) => `**${stripTags(match[1] ?? '')}**`);
  result = replaceAll(result, /<b[^>]*>([\s\S]*?)<\/b>/gi, (match) => `**${stripTags(match[1] ?? '')}**`);
  result = replaceAll(result, /<em[^>]*>([\s\S]*?)<\/em>/gi, (match) => `*${stripTags(match[1] ?? '')}*`);
  result = replaceAll(result, /<code[^>]*>([\s\S]*?)<\/code>/gi, (match) => `\`${stripTags(match[1] ?? '')}\``);
  result = result.replace(/<br\s*\/?>/gi, '\n');
  return result;
}

export function storageToMarkdown(storageHtml: string): string {
  if (!storageHtml.trim()) {
    return '';
  }

  try {
    let html = storageHtml;
    html = convertCodeBlocks(html);
    html = convertHeadings(html);
    html = convertLinks(html);
    html = convertTables(html);
    html = convertLists(html);
    html = convertInlineFormatting(html);
    html = convertParagraphs(html);
    html = html.replace(/<[^>]+>/g, ' ');
    const markdown = decodeEntities(html).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    if (!markdown || /^[>\s]+$/.test(markdown)) {
      return stripTags(storageHtml);
    }
    return markdown;
  } catch {
    return stripTags(storageHtml);
  }
}
