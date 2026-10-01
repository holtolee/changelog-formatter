function resolveTeam(areaPath, teamMapping) {
  const match = (teamMapping || []).find(
    (t) => areaPath && t.areaPath && areaPath.toLowerCase().includes(t.areaPath.toLowerCase())
  );
  return match || { areaPath: '', name: 'Autre', emoji: '' };
}

function resolveTypeLabel(workItemType, typeMapping) {
  const match = (typeMapping || []).find(
    (t) => t.workItemType.toLowerCase() === (workItemType || '').toLowerCase()
  );
  if (match) return `${match.emoji} [${match.label}]`.trim();
  return `[${workItemType}]`;
}

function workItemUrl(id, azureOrgVs, azureProject) {
  return `https://${azureOrgVs}.visualstudio.com/${encodeURIComponent(
    azureProject
  )}/_workitems/edit/${id}`;
}

function formatWorkItemLine(item, { typeMapping, azureOrgVs, azureProject }, indent) {
  const url = workItemUrl(item.id, azureOrgVs, azureProject);
  const assignee = item.assignedTo ? `@${item.assignedTo}` : '—';
  const typeLabel = resolveTypeLabel(item.type, typeMapping);
  return `${indent}* [#${item.id}](${url}) ${typeLabel} | ${item.title} — ${assignee}`;
}

// entries: parser output. workItemCache: Map<number, workItem|null> already fetched
// (including immediate parents) for every ticket referenced by entries.
function buildChangelogText({
  version,
  entries,
  workItemCache,
  teamMapping,
  typeMapping,
  azureOrgVs,
  azureProject,
}) {
  const orphanEntries = [];
  const roots = new Map(); // rootId -> { root, children: Map<id, item> }

  for (const entry of entries) {
    const item = entry.ticket ? workItemCache.get(Number(entry.ticket)) : null;
    if (!item) {
      orphanEntries.push(entry);
      continue;
    }

    let rootItem = item;
    let childItem = null;
    if (item.parentId) {
      const parent = workItemCache.get(item.parentId);
      if (parent) {
        rootItem = parent;
        childItem = item;
      }
    }

    if (!roots.has(rootItem.id)) {
      roots.set(rootItem.id, { root: rootItem, children: new Map() });
    }
    if (childItem) {
      roots.get(rootItem.id).children.set(childItem.id, childItem);
    }
  }

  const groups = new Map(); // team name -> { team, roots: [{root, children}] }
  for (const { root, children } of roots.values()) {
    const team = resolveTeam(root.areaPath, teamMapping);
    if (!groups.has(team.name)) groups.set(team.name, { team, roots: [] });
    groups.get(team.name).roots.push({ root, children: Array.from(children.values()) });
  }

  const orderedTeamNames = (teamMapping || []).map((t) => t.name);
  const groupKeys = Array.from(groups.keys()).sort((a, b) => {
    const ia = orderedTeamNames.indexOf(a);
    const ib = orderedTeamNames.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });

  const lines = [];
  if (orphanEntries.length) {
    lines.push('@Workitem orphelin');
    lines.push('');
    for (const e of orphanEntries) {
      const ticketPart = e.ticket ? `${e.ticket} | ` : '';
      const prLink = e.prUrl ? `[#${e.prNumber}](${e.prUrl})` : `#${e.prNumber}`;
      lines.push(`* ${ticketPart}${e.description} (${prLink})`);
    }
    lines.push('');
  }

  lines.push(`Changelog ${version}:`);
  for (const key of groupKeys) {
    const { team, roots: teamRoots } = groups.get(key);
    lines.push(team.emoji ? `${team.emoji} ${team.name}` : team.name);
    lines.push('');
    for (const { root, children } of teamRoots) {
      lines.push(formatWorkItemLine(root, { typeMapping, azureOrgVs, azureProject }, ''));
      for (const child of children) {
        lines.push(formatWorkItemLine(child, { typeMapping, azureOrgVs, azureProject }, '    '));
      }
    }
    lines.push('');
  }

  return `${lines.join('\n').trim()}\n`;
}

module.exports = { buildChangelogText, resolveTeam, resolveTypeLabel };
