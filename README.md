# CodeDocs

Unified Docusaurus documentation portal for **CostOps** and **OtakuVerse**.

Each project gets its own docs instance, sidebar, and URL namespace:

- `/costops/*` → sourced from `CostOps/docs/`
- `/otakuverse/*` → sourced from `OtakuVerse/docs/`

The site is built from this repo and published to GitHub Pages. A scheduled
job polls both source repos and rebuilds whenever either one changes — no
workflows or secrets are required inside `CostOps` / `OtakuVerse`.

## Repository layout

```
.
├── docs/
│   ├── costops/            # Mirror of CostOps/docs (overwritten on deploy)
│   │   ├── guides/
│   │   └── api/
│   └── otakuverse/         # Mirror of OtakuVerse/docs (overwritten on deploy)
│       ├── getting-started/
│       └── tutorials/
├── sidebars/
│   ├── costops.ts          # Sidebar config for the CostOps docs instance
│   └── otakuverse.ts       # Sidebar config for the OtakuVerse docs instance
├── src/
│   ├── css/custom.css      # Shared theme + per-project overrides
│   └── pages/index.tsx     # Landing page
├── static/
│   ├── .nojekyll
│   └── img/logo.svg
├── docusaurus.config.ts    # Two plugin-content-docs instances wired in here
├── tsconfig.json
├── package.json
└── .github/
    └── workflows/deploy-docs.yml   # Build + deploy, polls source repos
```

## Local development

> **Node 18, 20, or 22 required.** An `.nvmrc` is included — run `nvm use` or
> install Node 20. CI runs on Node 20.
>
> `webpack` is pinned to `5.105.4` via `overrides` in `package.json` because
> `5.106.0` tightened `ProgressPlugin` schema validation and breaks
> `webpackbar@6` (the progress reporter Docusaurus ships). Remove the override
> once `webpackbar` releases a compatible version.

```bash
npm install
npm run start      # dev server at http://localhost:3000
npm run build      # production build into ./build
npm run typecheck  # TypeScript check (docusaurus.config.ts + sidebars)
```

## Configuration

Open `docusaurus.config.ts` and set:

- `ORG_NAME` — your GitHub organization (e.g. `your-org`).
- `DOCS_REPO` — the name of this repo (default `CodeDocs`).

If you use a custom domain, set `url` to the domain (e.g. `https://docs.your-org.com`)
and `baseUrl` to `/`, then drop a `CNAME` file into `static/`.

## Adding a new project

1. Create `docs/<project>/` with at least an `intro.md`.
2. Add a sidebar file at `sidebars/<project>.ts`.
3. Register a new `@docusaurus/plugin-content-docs` entry in
   `docusaurus.config.ts` with its own `id`, `path`, and `routeBasePath`.
4. Add a navbar `docSidebar` item pointing at the new plugin id.
5. In `.github/workflows/deploy-docs.yml`, add a `NEWPROJECT_REPO` env entry,
   a `Checkout <NewProject>` step, and a `sync_project "<newproject>" ...`
   line inside the sync step. Also extend the `resolve_sha` calls and cache
   key in the `check` job so the scheduled poll detects changes.

## Auto-deploy flow

```
                                       ┌── CostOps (docs/)     ◄── polled
schedule / push / manual ─► CodeDocs ─►│
                                       └── OtakuVerse (docs/)  ◄── polled
                                                 │
                                                 ▼
                                            gh-pages
```

The `check` job resolves the latest SHA on each source repo's default branch
and compares it to the last-synced SHA stored in the Actions cache. The build
only runs when something changed, so scheduled runs are cheap when nothing is
new. Pushes to `CodeDocs` `main` always rebuild.

### One-time setup

All of this happens in the **`CodeDocs`** repo only. The source repos need no
changes.

1. **Enable GitHub Pages**
   - Settings → Pages → *Source*: **GitHub Actions**.

2. **Create a fine-grained PAT for reading the source repos**
   - https://github.com/settings/personal-access-tokens/new
   - **Resource owner**: `OpsAlchemist` (or whoever owns the source repos)
   - **Repository access**: *Only select repositories* → pick **CostOps** and
     **OtakuVerse**
   - **Repository permissions → Contents**: *Read-only*
   - Copy the generated token.
   - If the owner is an org with PAT approval enabled, an org admin approves
     it at *Org settings → Personal access tokens → Pending requests*.

3. **Save the token as a secret in `CodeDocs`**
   - Settings → Secrets and variables → Actions → *New repository secret*
   - Name: **`DOCS_SYNC_TOKEN`**
   - Value: the PAT from step 2.

4. *(Optional)* **Override the repo locations** if CostOps / OtakuVerse live
   under a different owner or name.
   - Settings → Secrets and variables → Actions → *Variables* tab
   - Add `COSTOPS_REPO` = `actualOwner/CostOps`
   - Add `OTAKUVERSE_REPO` = `actualOwner/OtakuVerse`

5. **Adjust the poll cadence** in `.github/workflows/deploy-docs.yml`
   (`schedule.cron`). Default is every 30 minutes.

### Manual trigger

From the Actions tab: *Build and Deploy Docusaurus Site* → **Run workflow**.
Optional inputs let you pin a specific ref per project or force a rebuild when
nothing has changed.

## Content conventions for source repos

Both `CostOps` and `OtakuVerse` need a top-level `docs/` directory. Its
contents are copied verbatim into this site, so the sidebar structure defined
in `sidebars/<project>.ts` must match the folder names used in each source
repo.

Suggested structure:

```
CostOps/docs/
├── intro.md
├── guides/
│   ├── _category_.json
│   └── *.md
└── api/
    ├── _category_.json
    └── *.md

OtakuVerse/docs/
├── intro.md
├── getting-started/
│   ├── _category_.json
│   └── *.md
└── tutorials/
    ├── _category_.json
    └── *.md
```

Front matter (`sidebar_position`, `slug`, etc.) is preserved. Use
`_category_.json` files to control category labels and ordering.

## Optional extras

- **Algolia DocSearch** — add a `themeConfig.algolia` block once you have an
  index. Both doc instances will be searchable from the same bar.
- **Analytics** — add `@docusaurus/plugin-google-gtag` (or Plausible) to the
  `plugins` array.
- **Versioning** — uncomment the `lastVersion`/`versions` block in the relevant
  plugin entry, then run `npm run docusaurus docs:version:<id> <version>`.
- **i18n** — extend `i18n.locales` in `docusaurus.config.ts` and run
  `npm run write-translations`.
