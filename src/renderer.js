let state = {
  teamMapping: [],
  typeMapping: [],
  lastReleaseBody: '',
  savedOwner: '',
  savedRepo: '',
  ownersLoaded: false,
};

function el(id) {
  return document.getElementById(id);
}

const settingsDialog = el('settings-dialog');

function openSettings() {
  if (!settingsDialog.open) settingsDialog.showModal();
}

async function withBusy(buttonId, task) {
  const button = el(buttonId);
  button.disabled = true;
  button.classList.add('is-busy');
  try {
    return await task();
  } finally {
    button.disabled = false;
    button.classList.remove('is-busy');
  }
}

function setStatus(id, message, variant) {
  const node = el(id);
  node.textContent = message || '';
  node.classList.toggle('error', variant === 'error' || variant === true);
  node.classList.toggle('ok', variant === 'ok');
}

function setPlaceholder(select, label) {
  select.innerHTML = '';
  const opt = document.createElement('option');
  opt.value = '';
  opt.textContent = label;
  select.appendChild(opt);
}

function addOption(select, value, label, type) {
  const opt = document.createElement('option');
  opt.value = value;
  opt.textContent = label;
  if (type) opt.dataset.type = type;
  select.appendChild(opt);
  return opt;
}

function rememberGithubTarget() {
  window.api
    .saveGithubTarget(state.savedOwner, state.savedRepo)
    .catch((err) => console.error('Sauvegarde owner/repo impossible :', err));
}

function resetReleases() {
  state.lastReleaseBody = '';
  setPlaceholder(el('gh-release'), '— choisir un repo —');
}

async function loadOwners() {
  const ownerSelect = el('gh-owner');
  ownerSelect.disabled = true;
  setPlaceholder(ownerSelect, '— chargement… —');
  try {
    const owners = await window.api.listOwners();
    ownerSelect.innerHTML = '';
    for (const o of owners) {
      addOption(ownerSelect, o.login, o.type === 'user' ? `${o.login} (perso)` : o.login, o.type);
    }
    // Un owner mémorisé qui n'apparaît plus dans la liste reste sélectionnable.
    if (state.savedOwner && !owners.some((o) => o.login === state.savedOwner)) {
      addOption(ownerSelect, state.savedOwner, state.savedOwner, 'org');
    }
    ownerSelect.value = state.savedOwner || (owners[0] && owners[0].login) || '';
    state.savedOwner = ownerSelect.value;
    state.ownersLoaded = true;
    await loadRepos(state.savedRepo);
  } catch (err) {
    setPlaceholder(ownerSelect, '— GitHub CLI indisponible —');
    setPlaceholder(el('gh-repo'), '—');
    setStatus('main-status', err.message, true);
  } finally {
    ownerSelect.disabled = !state.ownersLoaded;
  }
}

async function loadRepos(preferredRepo) {
  const ownerSelect = el('gh-owner');
  const repoSelect = el('gh-repo');
  const owner = ownerSelect.value;
  const type = ownerSelect.selectedOptions[0] && ownerSelect.selectedOptions[0].dataset.type;
  resetReleases();
  repoSelect.disabled = true;
  setPlaceholder(repoSelect, '— chargement… —');
  if (!owner) return;
  try {
    const repos = await window.api.listRepos(owner, type);
    setPlaceholder(repoSelect, repos.length ? '— choisir un repo —' : '— aucun repo —');
    for (const name of repos) addOption(repoSelect, name, name);
    if (preferredRepo && repos.includes(preferredRepo)) {
      repoSelect.value = preferredRepo;
      await withBusy('load-releases', loadReleases);
    }
  } catch (err) {
    setPlaceholder(repoSelect, '— erreur —');
    setStatus('main-status', err.message, true);
  } finally {
    repoSelect.disabled = false;
  }
}

function makeRow(table, values, onRemove) {
  const tr = document.createElement('tr');
  values.forEach((v, i) => {
    const td = document.createElement('td');
    const input = document.createElement('input');
    input.type = 'text';
    input.value = v;
    input.dataset.field = i;
    td.appendChild(input);
    tr.appendChild(td);
  });
  const actionTd = document.createElement('td');
  const removeBtn = document.createElement('button');
  removeBtn.textContent = '✕';
  removeBtn.type = 'button';
  removeBtn.className = 'remove-row';
  removeBtn.addEventListener('click', () => {
    tr.remove();
    onRemove();
  });
  actionTd.appendChild(removeBtn);
  tr.appendChild(actionTd);
  table.querySelector('tbody').appendChild(tr);
}

function renderTeamMapping() {
  const table = el('team-mapping-table');
  table.querySelector('tbody').innerHTML = '';
  state.teamMapping.forEach((t) => {
    makeRow(table, [t.areaPath, t.name, t.emoji], () => {});
  });
}

function renderTypeMapping() {
  const table = el('type-mapping-table');
  table.querySelector('tbody').innerHTML = '';
  state.typeMapping.forEach((t) => {
    makeRow(table, [t.workItemType, t.label, t.emoji], () => {});
  });
}

function readTableRows(tableId, keys) {
  const table = el(tableId);
  const rows = Array.from(table.querySelectorAll('tbody tr'));
  return rows.map((row) => {
    const inputs = Array.from(row.querySelectorAll('input'));
    const obj = {};
    keys.forEach((key, i) => {
      obj[key] = inputs[i].value.trim();
    });
    return obj;
  }).filter((obj) => Object.values(obj).some((v) => v));
}

async function loadSettingsIntoForm() {
  const settings = await window.api.getSettings();
  el('azure-org').value = settings.azureOrg || '';
  el('azure-project').value = settings.azureProject || '';
  el('azure-token').value = settings.azureToken || '';
  state.savedOwner = settings.githubOwner || '';
  state.savedRepo = settings.githubRepo || '';
  el('teams-webhook-prerelease').value = settings.teamsWebhookPrerelease || '';
  el('teams-webhook-release').value = settings.teamsWebhookRelease || '';
  el('encryption-warning').hidden = settings.encryptionAvailable !== false;

  state.teamMapping = settings.teamMapping || [];
  state.typeMapping = settings.typeMapping || [];
  renderTeamMapping();
  renderTypeMapping();

  if (!settings.azureOrg || !settings.azureProject || !settings.azureToken) openSettings();
}

async function saveSettingsFromForm() {
  const teamMapping = readTableRows('team-mapping-table', ['areaPath', 'name', 'emoji']);
  const typeMapping = readTableRows('type-mapping-table', ['workItemType', 'label', 'emoji']);

  const settings = {
    azureOrg: el('azure-org').value.trim(),
    azureProject: el('azure-project').value.trim(),
    azureToken: el('azure-token').value,
    teamMapping,
    typeMapping,
    teamsWebhookPrerelease: el('teams-webhook-prerelease').value,
    teamsWebhookRelease: el('teams-webhook-release').value,
  };

  const saved = await window.api.saveSettings(settings);
  state.teamMapping = saved.teamMapping;
  state.typeMapping = saved.typeMapping;
  setStatus('settings-status', 'Paramètres enregistrés.', 'ok');
}

function currentAzureConfig() {
  return {
    azureOrg: el('azure-org').value.trim(),
    azureProject: el('azure-project').value.trim(),
    azureToken: el('azure-token').value,
  };
}

async function loadReleases() {
  const owner = el('gh-owner').value.trim();
  const repo = el('gh-repo').value.trim();
  if (!owner || !repo) {
    setStatus('main-status', 'Choisis une organisation et un repo.', true);
    return;
  }
  setStatus('main-status', 'Chargement des releases…', false);
  try {
    const releases = await window.api.listReleases(owner, repo);
    const select = el('gh-release');
    select.innerHTML = '<option value="">— choisir une release —</option>';
    for (const r of releases) {
      const opt = document.createElement('option');
      opt.value = r.tag;
      opt.textContent = `${r.tag}${r.name ? ` — ${r.name}` : ''}${r.prerelease ? ' (pre-release)' : ''}`;
      select.appendChild(opt);
    }
    setStatus('main-status', `${releases.length} release(s) chargée(s).`, 'ok');
  } catch (err) {
    setStatus('main-status', err.message, true);
  }
}

el('gh-release').addEventListener('change', async () => {
  const owner = el('gh-owner').value.trim();
  const repo = el('gh-repo').value.trim();
  const tag = el('gh-release').value;
  if (!tag) return;
  setStatus('main-status', 'Chargement de la release…', false);
  try {
    const release = await window.api.getRelease(owner, repo, tag);
    state.lastReleaseBody = release.body;
    el('version-input').value = tag.replace(/^v/i, '');
    el('teams-target').value = release.prerelease ? 'prerelease' : 'release';
    setStatus('main-status', 'Release chargée.', 'ok');
  } catch (err) {
    setStatus('main-status', err.message, true);
  }
});

function renderDebugTable(entries) {
  const table = el('debug-table');
  table.querySelector('tbody').innerHTML = '';
  for (const e of entries) {
    const tr = document.createElement('tr');
    [e.type || '—', e.ticket || '—', e.description, e.author, `#${e.prNumber}`].forEach((v) => {
      const td = document.createElement('td');
      td.textContent = v;
      tr.appendChild(td);
    });
    table.querySelector('tbody').appendChild(tr);
  }
  el('debug-count').textContent = entries.length;
}

async function generateChangelog() {
  const owner = el('gh-owner').value.trim();
  const repo = el('gh-repo').value.trim();
  const version = el('version-input').value.trim();
  const azure = currentAzureConfig();

  if (!state.lastReleaseBody) {
    setStatus('main-status', 'Choisis d\'abord une release.', true);
    return;
  }
  if (!azure.azureOrg || !azure.azureProject || !azure.azureToken) {
    setStatus('main-status', 'Renseigne org/projet/token Azure DevOps dans les paramètres.', true);
    return;
  }

  setStatus('main-status', 'Génération en cours…', false);
  try {
    const result = await window.api.generateChangelog({
      body: state.lastReleaseBody,
      owner,
      repo,
      version,
      azureOrg: azure.azureOrg,
      azureProject: azure.azureProject,
      azureToken: azure.azureToken,
      teamMapping: state.teamMapping,
      typeMapping: state.typeMapping,
    });
    el('output').value = result.text;
    renderDebugTable(result.debug);
    setStatus('main-status', 'Changelog généré.', 'ok');
  } catch (err) {
    setStatus('main-status', err.message, true);
  }
}

async function checkGithubAuth() {
  const indicator = el('gh-indicator');
  indicator.classList.remove('ok', 'error');
  setStatus('gh-auth-status', 'Vérification…', false);
  const result = await window.api.checkGithubAuth();
  setStatus('gh-auth-status', result.message, result.authenticated ? 'ok' : 'error');
  indicator.classList.add(result.authenticated ? 'ok' : 'error');
  indicator.title = result.message;
  if (result.authenticated && !state.ownersLoaded) {
    await loadOwners();
  } else if (!result.authenticated) {
    setPlaceholder(el('gh-owner'), '— GitHub CLI non connecté —');
    setPlaceholder(el('gh-repo'), '—');
  }
}

el('gh-owner').addEventListener('change', () => {
  state.savedOwner = el('gh-owner').value;
  state.savedRepo = '';
  rememberGithubTarget();
  loadRepos();
});

el('gh-repo').addEventListener('change', () => {
  state.savedRepo = el('gh-repo').value;
  rememberGithubTarget();
  resetReleases();
  if (state.savedRepo) withBusy('load-releases', loadReleases);
});

el('check-gh-auth').addEventListener('click', () => {
  withBusy('check-gh-auth', checkGithubAuth);
});

el('open-settings').addEventListener('click', openSettings);
el('gh-indicator').addEventListener('click', openSettings);
el('close-settings').addEventListener('click', () => settingsDialog.close());
settingsDialog.addEventListener('click', (evt) => {
  if (evt.target === settingsDialog) settingsDialog.close();
});

async function loadAzureMetadataIntoTables() {
  const azure = currentAzureConfig();
  if (!azure.azureOrg || !azure.azureProject || !azure.azureToken) {
    setStatus('azure-metadata-status', 'Renseigne organisation/projet/token Azure DevOps.', true);
    return;
  }
  setStatus('azure-metadata-status', 'Chargement…', false);
  try {
    const { areas, workItemTypes } = await window.api.loadAzureMetadata(azure);

    const existingAreas = new Set(
      readTableRows('team-mapping-table', ['areaPath', 'name', 'emoji']).map((r) =>
        r.areaPath.toLowerCase()
      )
    );
    let addedAreas = 0;
    for (const area of areas) {
      if (existingAreas.has(area.toLowerCase())) continue;
      makeRow(el('team-mapping-table'), [area, area, ''], () => {});
      existingAreas.add(area.toLowerCase());
      addedAreas++;
    }

    const existingTypes = new Set(
      readTableRows('type-mapping-table', ['workItemType', 'label', 'emoji']).map((r) =>
        r.workItemType.toLowerCase()
      )
    );
    let addedTypes = 0;
    for (const type of workItemTypes) {
      if (existingTypes.has(type.toLowerCase())) continue;
      makeRow(el('type-mapping-table'), [type, type, ''], () => {});
      existingTypes.add(type.toLowerCase());
      addedTypes++;
    }

    setStatus(
      'azure-metadata-status',
      `${addedAreas} équipe(s) et ${addedTypes} type(s) ajouté(s). Pense à enregistrer les paramètres.`,
      'ok'
    );
  } catch (err) {
    setStatus('azure-metadata-status', err.message, true);
  }
}

el('load-azure-metadata').addEventListener('click', () => {
  withBusy('load-azure-metadata', loadAzureMetadataIntoTables);
});

el('add-team-row').addEventListener('click', () => {
  makeRow(el('team-mapping-table'), ['', '', ''], () => {});
});

el('add-type-row').addEventListener('click', () => {
  makeRow(el('type-mapping-table'), ['', '', ''], () => {});
});

el('save-settings').addEventListener('click', () => {
  withBusy('save-settings', saveSettingsFromForm).catch((err) =>
    setStatus('settings-status', err.message, true)
  );
});

el('load-releases').addEventListener('click', () => {
  withBusy('load-releases', loadReleases);
});

el('generate-btn').addEventListener('click', () => {
  withBusy('generate-btn', generateChangelog);
});

el('copy-btn').addEventListener('click', async () => {
  await window.api.copyToClipboard(el('output').value);
  setStatus('output-status', 'Copié dans le presse-papier.', 'ok');
});

el('export-btn').addEventListener('click', async () => {
  const version = el('version-input').value.trim();
  const result = await window.api.exportFile(el('output').value, `changelog-${version || 'output'}.txt`);
  if (result.saved) {
    setStatus('output-status', `Exporté vers ${result.filePath}`, 'ok');
  }
});

el('send-teams-btn').addEventListener('click', async () => {
  const text = el('output').value;
  if (!text.trim()) {
    setStatus('teams-status', "Rien à envoyer : génère d'abord le changelog.", true);
    return;
  }

  const target = el('teams-target').value;
  const webhookUrl =
    target === 'prerelease'
      ? el('teams-webhook-prerelease').value.trim()
      : el('teams-webhook-release').value.trim();
  if (!webhookUrl) {
    setStatus(
      'teams-status',
      `Aucune URL de webhook configurée pour le canal "${target === 'prerelease' ? 'Pre-release' : 'Release'}".`,
      true
    );
    return;
  }

  setStatus('teams-status', 'Envoi…', false);
  await withBusy('send-teams-btn', async () => {
    try {
      await window.api.sendToTeams(webhookUrl, text);
      setStatus('teams-status', 'Envoyé sur Teams.', 'ok');
    } catch (err) {
      setStatus('teams-status', err.message, true);
    }
  });
});

loadSettingsIntoForm().then(checkGithubAuth);
