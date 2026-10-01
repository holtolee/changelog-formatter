function authHeader(token) {
  return { Authorization: `Basic ${Buffer.from(`:${token}`).toString('base64')}` };
}

async function azureGet(url, token) {
  const res = await fetch(url, { headers: authHeader(token) });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Azure DevOps API ${res.status} sur ${url}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

async function fetchWorkItemRaw(id, { org, project, token }) {
  const url = `https://dev.azure.com/${encodeURIComponent(org)}/${encodeURIComponent(
    project
  )}/_apis/wit/workitems/${id}?$expand=relations&api-version=7.1`;
  const res = await fetch(url, { headers: authHeader(token) });
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Azure DevOps API ${res.status} sur work item ${id}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

// Immediate children of the project's root area node — the usual level at which
// teams/areas are organized (e.g. "Project\TeamA", "Project\TeamB").
async function fetchAreaPaths({ org, project, token }) {
  const url = `https://dev.azure.com/${encodeURIComponent(org)}/${encodeURIComponent(
    project
  )}/_apis/wit/classificationnodes/areas?$depth=1&api-version=7.1`;
  const data = await azureGet(url, token);
  return (data.children || []).map((c) => c.name);
}

async function fetchWorkItemTypes({ org, project, token }) {
  const url = `https://dev.azure.com/${encodeURIComponent(org)}/${encodeURIComponent(
    project
  )}/_apis/wit/workitemtypes?api-version=7.1`;
  const data = await azureGet(url, token);
  return (data.value || []).map((t) => t.name);
}

function toWorkItem(raw) {
  const fields = raw.fields || {};
  const parentRelation = (raw.relations || []).find(
    (r) => r.rel === 'System.LinkTypes.Hierarchy-Reverse'
  );
  const parentMatch = parentRelation && parentRelation.url.match(/workItems\/(\d+)$/i);
  return {
    id: raw.id,
    type: fields['System.WorkItemType'] || 'Unknown',
    title: fields['System.Title'] || '',
    areaPath: fields['System.AreaPath'] || '',
    assignedTo: fields['System.AssignedTo'] ? fields['System.AssignedTo'].displayName : null,
    parentId: parentMatch ? Number(parentMatch[1]) : null,
  };
}

// Fetches a work item and walks up its parent chain, using `cache` (Map<id, workItem|null>)
// to avoid refetching the same id twice within a run.
async function fetchWorkItemWithAncestors(id, azureConfig, cache) {
  if (cache.has(id)) return cache.get(id);
  const raw = await fetchWorkItemRaw(id, azureConfig);
  if (!raw) {
    cache.set(id, null);
    return null;
  }
  const item = toWorkItem(raw);
  cache.set(id, item);
  if (item.parentId) {
    await fetchWorkItemWithAncestors(item.parentId, azureConfig, cache);
  }
  return item;
}

module.exports = { fetchWorkItemWithAncestors, fetchAreaPaths, fetchWorkItemTypes };
