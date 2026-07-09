export interface DescriptionSections {
  userStory: string | null;
  requirements: string | null;
  sme: string | null;
  acceptanceCriteria: string[];
  notes: string | null;
}

function headingRegex(name: string): RegExp {
  return new RegExp(`^#{1,6}\\s*${name}\\s*$`, 'gim');
}

function sectionBetween(description: string, startPattern: RegExp, endPattern: RegExp): string | null {
  const startMatch = startPattern.exec(description);
  if (!startMatch || startMatch.index === undefined) {
    return null;
  }
  endPattern.lastIndex = startPattern.lastIndex;
  const endMatch = endPattern.exec(description);
  const start = startPattern.lastIndex;
  const end = endMatch ? endMatch.index : description.length;
  const content = description.slice(start, end).trim();
  return content.length > 0 ? content : null;
}

function collectAcBlocks(description: string): string[] {
  const blocks: string[] = [];
  const lines = description.split('\n');
  let active: string[] = [];

  const flush = () => {
    if (active.length === 0) return;
    const value = active.join('\n').trim();
    if (/(GIVEN|WHEN|THEN)/i.test(value)) {
      blocks.push(value);
    }
    active = [];
  };

  for (const line of lines) {
    if (/^AC\d+\s*[:\-]/i.test(line.trim())) {
      flush();
      active.push(line);
      continue;
    }
    if (active.length > 0) {
      if (/^#{1,6}\s+/.test(line.trim())) {
        flush();
        continue;
      }
      active.push(line);
    }
  }
  flush();
  return blocks;
}

export function parseDescriptionSections(
  description: string,
  options?: { smePattern?: RegExp },
): DescriptionSections {
  const normalized = description.replace(/\r\n/g, '\n');
  const anyHeading = /^#{1,6}\s+.+$/gim;
  const userStory = sectionBetween(normalized, headingRegex('user\\s*story'), anyHeading);
  const requirements = sectionBetween(normalized, headingRegex('requirements?'), anyHeading);
  const notes = sectionBetween(normalized, headingRegex('notes?'), anyHeading);
  const acceptanceSection = sectionBetween(normalized, headingRegex('acceptance\\s*criteria'), anyHeading);

  const smePattern = options?.smePattern ?? /\*\*SME\*\*:\s*(.+)$/gim;
  const smeMatch = smePattern.exec(normalized);
  const acceptanceCriteria = collectAcBlocks(acceptanceSection ?? normalized);

  return {
    userStory,
    requirements,
    sme: smeMatch?.[1]?.trim() ?? null,
    acceptanceCriteria,
    notes,
  };
}
