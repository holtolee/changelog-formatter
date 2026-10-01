function extractWhatsChangedLines(body) {
  const lines = body.split('\n');
  const startIdx = lines.findIndex((l) => /what'?s changed/i.test(l));
  const start = startIdx === -1 ? 0 : startIdx + 1;
  let endIdx = lines.findIndex(
    (l, i) => i > start && /new contributors|full changelog/i.test(l)
  );
  if (endIdx === -1) endIdx = lines.length;
  return lines.slice(start, endIdx);
}

// Matches: "<type>(<ticket>): <description> by @<author> in <#NNN | PR url>"
// Tolerates both the raw GitHub API markdown and the bracketed [@x](url) form
// GitHub sometimes renders in the UI.
const BULLET_RE = /^\*\s+(.*)$/;
const TAIL_RE =
  /^(?<desc>.*?)\s+by\s+(?:\[@(?<author1>[^\]]+)\][^\s]*|@(?<author2>\S+))\s+in\s+(?:\[#(?<pr1>\d+)\]\((?<prUrl1>[^)]+)\)|#(?<pr2>\d+)|(?<prUrl3>https?:\/\/\S+\/pull\/(?<pr3>\d+)))\s*$/;
const TYPE_RE = /^([a-zA-Z]+)\(([^)]*)\)\s*:\s*(.*)$/;

function parseWhatsChanged(body, { owner, repo } = {}) {
  const entries = [];
  for (const rawLine of extractWhatsChangedLines(body)) {
    const bulletMatch = BULLET_RE.exec(rawLine.trim());
    if (!bulletMatch) continue;
    const content = bulletMatch[1];
    const tailMatch = TAIL_RE.exec(content);
    if (!tailMatch) continue;
    const g = tailMatch.groups;
    const desc = g.desc.trim();
    const author = g.author1 || g.author2;
    const prNumber = g.pr1 || g.pr2 || g.pr3;
    const prUrl = g.prUrl1 || g.prUrl3 || (owner && repo ? `https://github.com/${owner}/${repo}/pull/${prNumber}` : '');

    const typeMatch = TYPE_RE.exec(desc);
    let type = null;
    let ticket = null;
    let description = desc;
    if (typeMatch) {
      type = typeMatch[1];
      const ticketRaw = typeMatch[2];
      const ticketNumMatch = ticketRaw.match(/\d+/);
      ticket = ticketNumMatch ? ticketNumMatch[0] : null;
      description = typeMatch[3].trim();
    }

    entries.push({ type, ticket, description, author, prNumber, prUrl });
  }
  return entries;
}

module.exports = { parseWhatsChanged };
