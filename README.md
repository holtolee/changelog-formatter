# Changelog Formatter

Application Electron qui transforme le changelog "What's Changed" auto-généré par une release GitHub en changelog compatible Teams, groupé par équipe, en enrichissant chaque ticket via l'API Azure DevOps (type de work item, titre, assigné, hiérarchie parent/enfant).

## Prérequis

- Node.js 18+ (testé avec Node 24).
- [GitHub CLI](https://cli.github.com) (`gh`), authentifié — utilisé à la place d'un PAT GitHub pour lire les releases.
- Un Personal Access Token (PAT) Azure DevOps avec accès en lecture aux Work Items du projet concerné.

### Installer et authentifier GitHub CLI

| OS | Commande |
| --- | --- |
| Ubuntu | `sudo apt update && sudo apt install gh -y` |
| macOS | `brew install gh` |
| Windows | `winget install --id GitHub.cli` |

```bash
gh auth login
```

Choisis `GitHub.com`, le protocole HTTPS (ou SSH si tu préfères), puis suis le flux de connexion (navigateur ou device code). Une fois connecté, vérifie :

```bash
gh auth status
```

### Créer un PAT Azure DevOps

Dans Azure DevOps : `User settings` → `Personal access tokens` → `New Token`, avec le scope `Work Items (Read)` au minimum, sur l'organisation concernée. Ce token sera collé dans les paramètres de l'app (il est stocké chiffré localement via `safeStorage` quand c'est disponible sur le système).

## Installation

```bash
npm install
```

## Lancer l'app

```bash
npm start
```

## Builds (Ubuntu, macOS, Windows)

Le packaging utilise [electron-builder](https://www.electron.build). Les fichiers sont générés dans `dist/`.

| Commande | Sortie |
| --- | --- |
| `npm run dist:linux` | `.AppImage` et `.deb` (x64) |
| `npm run dist:mac` | `.dmg` et `.zip` (Intel x64 et Apple Silicon arm64) |
| `npm run dist:win` | installeur NSIS `.exe` et `.exe` portable (x64) |
| `npm run pack` | app non empaquetée pour l'OS courant (`dist/*-unpacked`), utile pour tester vite |

Chaque OS doit être buildé sur lui-même : le build macOS nécessite un Mac, et le build Windows depuis Linux nécessite Wine. Le plus simple est de passer par la CI.

### CI GitHub Actions

Le workflow [.github/workflows/build.yml](.github/workflows/build.yml) builde l'app sur `ubuntu-latest`, `macos-latest` et `windows-latest` à chaque push sur `main`, à chaque pull request, ou sur déclenchement manuel. Les fichiers sont téléchargeables dans l'onglet **Actions** du run, section *Artifacts*.

Pour publier une release avec les installeurs attachés, pousse un tag `v*` :

```bash
npm version patch   # ou minor / major : met à jour package.json et crée le tag
git push --follow-tags
```

### Installer les builds

- **Ubuntu** : `sudo apt install ./changelog-formatter-<version>-linux-amd64.deb` (recommandé). L'AppImage fonctionne aussi (`chmod +x` puis lancer), mais nécessite `libfuse2` (`sudo apt install libfuse2t64` sur Ubuntu 24.04+).
- **macOS** : l'app n'est signée qu'en ad-hoc (pas de certificat Apple Developer). Au premier lancement, macOS la bloque : clic droit sur l'app → **Ouvrir**, ou retirer la quarantaine :

  ```bash
  xattr -cr "/Applications/Changelog Formatter.app"
  ```

- **Windows** : l'installeur n'est pas signé, SmartScreen affiche un avertissement → **Informations complémentaires** → **Exécuter quand même**.

Pour une vraie signature (Apple Developer ID, certificat Windows), voir la [doc code signing d'electron-builder](https://www.electron.build/code-signing) ; côté macOS, retirer alors `"identity": "-"` et `"hardenedRuntime": false` du bloc `build.mac` de `package.json`.

## Utilisation

### 1. Paramètres (bouton **Paramètres** en haut à droite)

La fenêtre des paramètres s'ouvre automatiquement au premier lancement, tant que l'organisation, le projet et le token Azure DevOps ne sont pas renseignés. La pastille **GitHub CLI** de l'en-tête passe au vert quand `gh` est authentifié.


- **GitHub** : rien à saisir, clique "Vérifier" pour confirmer que `gh` est bien authentifié.
- **Azure DevOps** :
  - `Organisation` : le nom d'org Azure DevOps, utilisé pour l'API (`dev.azure.com/{org}`) et pour générer les liens (`https://{org}.visualstudio.com/...`).
  - `Projet` : le nom du projet Azure DevOps.
  - `Token (PAT)` : le PAT créé ci-dessus.
  - **Charger équipes et types depuis Azure DevOps** : une fois org/projet/token renseignés, ce bouton interroge Azure DevOps pour lister automatiquement les areas (enfants directs de la racine du projet, ex. `TeamA`, `TeamB`) et les types de work item du projet, et ajoute une ligne pour chacun dans les deux tableaux ci-dessous (sans doublonner les lignes déjà présentes). Les emojis ne sont pas connus d'Azure DevOps : il faut les compléter à la main après coup.
- **Équipes (Area Path → nom + emoji)** : une ligne par équipe. Le premier champ est une sous-chaîne recherchée dans l'`Area Path` du work item (ex. `TeamA`), suivi du nom affiché (ex. `TeamA`) et d'un emoji (ex. `🍏`). Les work items dont l'Area Path ne correspond à aucune ligne sont groupés sous "Autre".
- **Types de work item (Azure DevOps → libellé + emoji)** : pré-rempli avec `Product Backlog Item → PBI 💻`, `Task → Task 🧾`, `Bug → Retour QA 💥`. Modifiable/complétable selon les types utilisés dans le projet.
- **Microsoft Teams** : deux URL de webhook, une par canal (pré-release et release) — voir [Configurer les webhooks Teams](#configurer-les-webhooks-teams) ci-dessous.

Après avoir chargé/complété les tableaux et renseigné les webhooks, clique **Enregistrer les paramètres** pour tout persister.

### 2. Charger une release GitHub

- Choisis l'`Organisation` puis le `Repo` dans les menus déroulants. Ils sont remplis via `gh` avec tes organisations GitHub et ton compte perso, et les repos archivés sont masqués.
- Les releases du repo se chargent automatiquement dans le menu `Release` (bouton **Actualiser les releases** pour les recharger). L'organisation et le repo choisis sont mémorisés pour le prochain lancement.
- Sélectionne une release : son changelog brut est récupéré et la `Version affichée` est pré-remplie depuis le tag (préfixe `v` retiré, éditable).

### 3. Générer le changelog

Clique **Générer**. L'app :

1. Parse chaque ligne `type(ticket): description by @auteur in #PR` du changelog GitHub.
2. Pour chaque ticket numérique, interroge Azure DevOps (type, titre, assigné, area path, parent).
3. Si le ticket n'existe pas dans Azure DevOps (ou n'a pas de numéro exploitable), la ligne part dans la section `@Workitem orphelin` en tête de sortie.
4. Sinon, le ticket est rattaché à son parent immédiat (s'il en a un) pour l'indentation, puis groupé par équipe (déduite de l'Area Path) dans la section `Changelog {version}:`.

Le panneau **Détail du parsing (debug)** liste chaque entrée parsée (type conventional commit, ticket, description, auteur, PR) pour vérifier que l'extraction est correcte avant de faire confiance au résultat.

### 4. Récupérer le résultat

- **Copier** : copie le texte généré dans le presse-papier (prêt à coller dans Teams ou Slack).
- **Exporter…** : ouvre une boîte de dialogue pour sauvegarder le résultat dans un fichier `.txt`/`.md`.
- **Envoyer sur Teams** : poste le texte généré dans le canal Teams sélectionné (`Pre-release` ou `Release`) via le webhook correspondant configuré dans les paramètres. Le sélecteur de canal est pré-positionné automatiquement selon le flag "pre-release" de la release GitHub chargée, mais reste modifiable avant l'envoi.

Le champ de résultat reste éditable : tu peux ajuster le texte généré avant de le copier/exporter/envoyer.

## Configurer les webhooks Teams

Chaque canal Teams (celui des pre-releases et celui des releases) doit exposer un webhook entrant :

1. Dans le canal Teams cible, clique `⋯` (plus d'options) → `Workflows`.
2. Choisis le modèle **"Post to a channel when a webhook request is received"**.
3. Termine l'assistant : Teams génère une URL de webhook unique pour ce canal.
4. Copie cette URL dans le champ `Webhook pré-release` ou `Webhook release` des paramètres de l'app, selon le canal.

L'app envoie une requête `POST` au format message Teams avec une pièce jointe Adaptive Card. Le contenu à transmettre à l'action **Post card in a chat or channel** est `attachments[0].content`. Cette valeur est un objet dont `type` vaut `AdaptiveCard` et dont le texte est dans `body[0].text`. Si le workflow utilise une variable `Attachments`, elle doit contenir `body('When_a_Teams_webhook_request_is_received')?['attachments']`, puis l'action doit recevoir le contenu de la première pièce jointe, et non le tableau complet.

## Format de sortie

Le texte de la carte utilise le Markdown pris en charge par les Adaptive Cards : liens `[texte](url)`, retours à la ligne et emojis Unicode. Le changelog est placé dans un `TextBlock` avec `wrap: true`; les emojis restent des caractères Unicode et les liens restent des liens Markdown.

```
@Workitem orphelin

* 999 | fix typo in README ([#42](https://github.com/{owner}/{repo}/pull/42))

Changelog 1.2.0:
🍏 TeamA

* [#101](https://{org}.visualstudio.com/{project}/_workitems/edit/101) 💻 [PBI] | Titre du PBI — @Assignee
    * [#102](https://{org}.visualstudio.com/{project}/_workitems/edit/102) 🧾 [Task] | Titre de la tâche — @Assignee

🍐 TeamB

* [#103](https://{org}.visualstudio.com/{project}/_workitems/edit/103) 💥 [Retour QA] | Titre du bug — @Assignee
```

## Résolution de problèmes

| Symptôme | Cause probable | Solution |
| --- | --- | --- |
| Menu Organisation vide ou "GitHub CLI non connecté" | `gh` non authentifié, ou scope `read:org` manquant | `gh auth login` (ou `gh auth refresh -s read:org`), puis "Vérifier" dans les paramètres |
| "GitHub CLI (gh) introuvable" | `gh` n'est pas installé, ou installé hors des emplacements usuels | Installer `gh` (voir [Prérequis](#installer-et-authentifier-github-cli)) puis `gh auth login`. L'app cherche aussi `gh` dans `/opt/homebrew/bin`, `/usr/local/bin`, `/snap/bin`, `~/.local/bin` et `C:\Program Files\GitHub CLI` |
| Statut GitHub en erreur après "Vérifier" | Pas connecté / session expirée | `gh auth login` puis relancer "Vérifier" |
| "Azure DevOps API 401/403" | PAT invalide, expiré, ou scope insuffisant | Recréer un PAT avec le scope `Work Items (Read)` |
| "Azure DevOps API 404" sur un ticket référencé | Ticket inexistant ou mauvais projet/org configuré | Vérifier `Organisation`/`Projet` dans les paramètres ; sinon le ticket part normalement dans les orphelins |
| Une équipe attendue n'apparaît pas / tout tombe dans "Autre" | Aucune ligne de mapping équipe ne correspond à l'Area Path réel | Vérifier l'Area Path exact du work item dans Azure DevOps et ajuster la sous-chaîne dans le mapping |
| Tickets non regroupés sous leur PBI | Le ticket référencé n'a pas de lien "Parent" dans Azure DevOps, ou le parent lui-même n'a pas pu être récupéré | Vérifier la hiérarchie dans Azure DevOps ; seul un niveau de parent est pris en compte |
| "The specified Teams flowbot adaptive card request is missing or invalid" | L'action reçoit le tableau `attachments` ou le corps entier au lieu de `attachments[0].content` | Dans "Post card in a chat or channel", transmettre `attachments[0].content` et vérifier que son champ `type` vaut `AdaptiveCard` |
| "Envoi Teams échoué (400)" | Le workflow Teams attend un schéma JSON différent | Ouvrir le workflow dans Power Automate et vérifier le schéma du déclencheur ainsi que le contenu transmis à l'action Adaptive Card |
| "Envoi Teams échoué (404/403)" | URL de webhook invalide, expirée, ou workflow supprimé | Recréer le workflow "Post to a channel when a webhook request is received" dans le canal et remplacer l'URL |
| "Aucune URL de webhook configurée pour ce canal" | Le champ webhook correspondant est vide dans les paramètres | Renseigner et enregistrer l'URL du webhook pour ce canal |

## Structure du projet

```
.github/workflows/
  build.yml     # CI : builds Ubuntu / macOS / Windows + release sur tag v*
electron/
  main.js       # process principal : fenêtre, IPC, orchestration
  preload.js    # API exposée au renderer via contextBridge
  settings.js   # stockage des paramètres (electron-store) + chiffrement du PAT Azure DevOps
src/
  index.html    # interface
  style.css     # thème néon rétro (cyan #00e5ff / magenta #e6057b)
  fonts/        # polices embarquées (Orbitron, Chakra Petch, JetBrains Mono — SIL OFL)
  renderer.js   # logique UI
  github.js     # appels GitHub via `gh api`
  azureDevOps.js# appels API Azure DevOps (work items + hiérarchie parent)
  teams.js      # envoi du changelog vers un webhook Microsoft Teams
  parser.js     # parsing du markdown "What's Changed"
  formatter.js  # regroupement par équipe/hiérarchie + rendu du texte final
```

## Sécurité

- Le PAT Azure DevOps et les URL de webhook Teams sont chiffrés au repos via l'API `safeStorage` d'Electron quand le système le permet (sinon stockés en clair localement avec un avertissement affiché dans l'app).
- Aucun secret n'est envoyé ailleurs qu'à `dev.azure.com` (Azure DevOps), `api.github.com` (via `gh`, qui gère lui-même son authentification) et l'URL de webhook Teams configurée.
