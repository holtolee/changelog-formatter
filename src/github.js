const { execFile } = require('child_process');
const os = require('os');
const path = require('path');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

// Une app lancée depuis le Finder (macOS) ou un menu d'applications n'hérite pas
// du PATH du shell : on ajoute les emplacements d'installation usuels de `gh`.
const EXTRA_GH_DIRS = {
  darwin: ['/opt/homebrew/bin', '/usr/local/bin'],
  linux: ['/usr/local/bin', '/snap/bin', '/home/linuxbrew/.linuxbrew/bin', path.join(os.homedir(), '.local', 'bin')],
  win32: [path.join(process.env.ProgramFiles || 'C:\\Program Files', 'GitHub CLI')],
};

function ghEnv() {
  const env = { ...process.env };
  // Sous Windows la clé est souvent `Path` : on réutilise la clé existante pour ne pas la dupliquer.
  const pathKey = Object.keys(env).find((key) => key.toUpperCase() === 'PATH') || 'PATH';
  const current = (env[pathKey] || '').split(path.delimiter).filter(Boolean);
  const extra = (EXTRA_GH_DIRS[process.platform] || []).filter((dir) => !current.includes(dir));
  env[pathKey] = [...current, ...extra].join(path.delimiter);
  return env;
}

const GH_NOT_FOUND_MESSAGE =
  "GitHub CLI (gh) introuvable. Installe-le (https://cli.github.com) puis lance `gh auth login`.";

async function runGhApi(path, extraArgs = []) {
  try {
    const { stdout } = await execFileAsync('gh', ['api', path, ...extraArgs], {
      env: ghEnv(),
      maxBuffer: 10 * 1024 * 1024,
    });
    return stdout;
  } catch (err) {
    if (err.code === 'ENOENT') throw new Error(GH_NOT_FOUND_MESSAGE);
    const stderr = (err.stderr || '').toString().trim();
    throw new Error(`gh api ${path} a échoué : ${stderr || err.message}`);
  }
}

async function ghApi(path) {
  return JSON.parse(await runGhApi(path));
}

// Parcourt toutes les pages et renvoie une ligne par élément extrait par le filtre jq.
async function ghApiLines(path, jq) {
  const stdout = await runGhApi(path, ['--paginate', '--jq', jq]);
  return stdout.split('\n').map((line) => line.trim()).filter(Boolean);
}

const repoPath = (owner, repo) => `repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;

const byName = (a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' });

async function checkAuth() {
  try {
    const { stdout, stderr } = await execFileAsync('gh', ['auth', 'status'], { env: ghEnv() });
    return { authenticated: true, message: (stdout || stderr).toString().trim() };
  } catch (err) {
    if (err.code === 'ENOENT') {
      return { authenticated: false, message: GH_NOT_FOUND_MESSAGE };
    }
    return {
      authenticated: false,
      message: (err.stderr || err.message || '').toString().trim() || 'Non authentifié.',
    };
  }
}

async function listOwners() {
  const [user, orgs] = await Promise.all([
    ghApi('user'),
    ghApiLines('user/orgs?per_page=100', '.[].login'),
  ]);
  return [
    ...orgs.sort(byName).map((login) => ({ login, type: 'org' })),
    { login: user.login, type: 'user' },
  ];
}

async function listRepos(owner, type) {
  const path =
    type === 'user'
      ? 'user/repos?affiliation=owner&per_page=100'
      : `orgs/${encodeURIComponent(owner)}/repos?per_page=100`;
  const names = await ghApiLines(path, '.[] | select(.archived | not) | .name');
  return names.sort(byName);
}

async function listReleases(owner, repo) {
  const releases = await ghApi(`${repoPath(owner, repo)}/releases?per_page=30`);
  return releases.map((r) => ({
    tag: r.tag_name,
    name: r.name,
    prerelease: r.prerelease,
    publishedAt: r.published_at,
  }));
}

async function getReleaseByTag(owner, repo, tag) {
  const release = await ghApi(`${repoPath(owner, repo)}/releases/tags/${encodeURIComponent(tag)}`);
  return {
    tag: release.tag_name,
    name: release.name,
    body: release.body || '',
    prerelease: Boolean(release.prerelease),
  };
}

module.exports = { listOwners, listRepos, listReleases, getReleaseByTag, checkAuth };
