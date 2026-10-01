const { safeStorage } = require('electron');

let storePromise;
function getStore() {
  if (!storePromise) {
    storePromise = import('electron-store').then(({ default: Store }) => new Store({ name: 'settings' }));
  }
  return storePromise;
}

const DEFAULT_TYPE_MAPPING = [
  { workItemType: 'Product Backlog Item', label: 'PBI', emoji: '💻' },
  { workItemType: 'Task', label: 'Task', emoji: '🧾' },
  { workItemType: 'Bug', label: 'Retour QA', emoji: '💥' },
];

function encryptionAvailable() {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

function encryptToken(plain) {
  if (!plain) return '';
  if (!encryptionAvailable()) return `plain:${plain}`;
  return `enc:${safeStorage.encryptString(plain).toString('base64')}`;
}

function decryptToken(stored) {
  if (!stored) return '';
  if (stored.startsWith('plain:')) return stored.slice('plain:'.length);
  if (stored.startsWith('enc:')) {
    try {
      return safeStorage.decryptString(Buffer.from(stored.slice('enc:'.length), 'base64'));
    } catch {
      return '';
    }
  }
  return '';
}

async function getSettings() {
  const store = await getStore();
  return {
    githubOwner: store.get('githubOwner', ''),
    githubRepo: store.get('githubRepo', ''),
    azureOrg: store.get('azureOrg', ''),
    azureProject: store.get('azureProject', ''),
    azureToken: decryptToken(store.get('azureTokenEnc', '')),
    teamMapping: store.get('teamMapping', []),
    typeMapping: store.get('typeMapping', DEFAULT_TYPE_MAPPING),
    teamsWebhookPrerelease: decryptToken(store.get('teamsWebhookPrereleaseEnc', '')),
    teamsWebhookRelease: decryptToken(store.get('teamsWebhookReleaseEnc', '')),
    encryptionAvailable: encryptionAvailable(),
  };
}

async function saveSettings(settings) {
  const store = await getStore();
  if (typeof settings.githubOwner === 'string') store.set('githubOwner', settings.githubOwner);
  if (typeof settings.githubRepo === 'string') store.set('githubRepo', settings.githubRepo);
  store.set('azureOrg', settings.azureOrg || '');
  store.set('azureProject', settings.azureProject || '');
  store.set('teamMapping', settings.teamMapping || []);
  store.set('typeMapping', settings.typeMapping || DEFAULT_TYPE_MAPPING);
  if (typeof settings.azureToken === 'string') {
    store.set('azureTokenEnc', encryptToken(settings.azureToken));
  }
  if (typeof settings.teamsWebhookPrerelease === 'string') {
    store.set('teamsWebhookPrereleaseEnc', encryptToken(settings.teamsWebhookPrerelease));
  }
  if (typeof settings.teamsWebhookRelease === 'string') {
    store.set('teamsWebhookReleaseEnc', encryptToken(settings.teamsWebhookRelease));
  }
  return getSettings();
}

// Mémorise l'owner/repo choisis sur l'écran principal, sans toucher au reste des paramètres.
async function saveGithubTarget({ owner, repo }) {
  const store = await getStore();
  store.set('githubOwner', owner || '');
  store.set('githubRepo', repo || '');
}

module.exports = { getSettings, saveSettings, saveGithubTarget, DEFAULT_TYPE_MAPPING };
