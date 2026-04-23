# CodeDocs

Unified Docusaurus documentation portal for **CostOps** and **OtakuVerse**.

Each project gets its own docs instance, sidebar, and URL namespace:

- `/costops/*` → sourced from `CostOps/docs/`
- `/otakuverse/*` → sourced from `OtakuVerse/docs/`

The site is built from this repo, published to GitHub Pages, and automatically
rebuilt whenever either source project pushes to `main`.

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
    ├── workflows/deploy-docs.yml        # Build + deploy this site
    └── workflow-templates/docs-update.yml  # Drop into source repos to trigger
```

## Local development

> **Node 18, 20, or 22 required.** Node 23 has a webpack regression that breaks
> the production build ([facebook/docusaurus#10684](https://github.com/facebook/docusaurus/issues/10684)).
> An `.nvmrc` is included — run `nvm use` or install Node 20. CI runs on Node 20.

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
5. In the source repo, copy `.github/workflow-templates/docs-update.yml` into
   `.github/workflows/` and add a matching `actions/checkout` + sync step in
   `deploy-docs.yml`.

## Auto-deploy flow

```
CostOps push ─┐
              ├─► repository_dispatch (update-docs) ─► CodeDocs build ─► gh-pages
OtakuVerse push ─┘
```

### One-time setup

1. **This repo (`CodeDocs`)**
   - Settings → Pages → *Source*: **GitHub Actions**.
   - The workflow uses the built-in `GITHUB_TOKEN`; no extra secret required if
     the source repos are public. For private source repos, create a
     fine-grained PAT with `contents: read` on both source repos and save it
     as the `DOCS_SYNC_TOKEN` secret.

2. **CostOps and OtakuVerse repos**
   - Copy `.github/workflow-templates/docs-update.yml` from this repo into
     `.github/workflows/docs-update.yml`.
   - Create a PAT with `contents: write` on this docs repo and save it as the
     `DOCS_DISPATCH_TOKEN` secret in each source repo.

### Manual trigger

You can force a rebuild from the Actions tab (*Build and Deploy Docusaurus
Site* → **Run workflow**), or via the API:

```bash
gh api repos/<org>/CodeDocs/dispatches \
  -f event_type=update-docs
```

## Content conventions for source repos

Both `CostOps` and `OtakuVerse` should keep their documentation under a
top-level `docs/` directory. The layout is copied verbatim into this site, so
the sidebar structure defined in `sidebars/<project>.ts` must match the folder
names used in each source repo.

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
