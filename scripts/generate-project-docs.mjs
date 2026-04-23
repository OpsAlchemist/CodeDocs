#!/usr/bin/env node
/**
 * Generate documentation for a source repository checked out under
 * `temp/<id>/`, writing the result into `docs/<id>/`.
 *
 * What it produces:
 *   - `intro.md` sourced from the repo's top-level README.md (if present)
 *   - `reference/<path>.md` for every other *.md file in the repo
 *   - `overview/project-structure.md` — an auto-generated file tree
 *   - (optional) `api/typescript/**` via TypeDoc when tsconfig + entry point exist
 *   - (optional) `api/python/**` via pdoc when a detectable Python package exists
 *
 * Called per project from the deploy workflow:
 *   node scripts/generate-project-docs.mjs --id costops --repo OpsAlchemist/CostOps --src temp/costops
 */
import { execSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, cpSync, statSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve, sep, basename } from 'node:path';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    id: { type: 'string' },
    repo: { type: 'string' },
    src: { type: 'string' },
    dest: { type: 'string', default: 'docs' },
    branch: { type: 'string', default: 'main' },
  },
});

const id = values.id;
const repo = values.repo;
const src = resolve(values.src);
const destRoot = resolve(join(values.dest, id));
const branch = values.branch;

if (!id || !repo || !src) {
  console.error('usage: generate-project-docs.mjs --id <id> --repo <owner/repo> --src <path> [--dest docs] [--branch main]');
  process.exit(2);
}

if (!existsSync(src)) {
  console.warn(`::warning::source directory ${src} does not exist; skipping ${id}`);
  process.exit(0);
}

console.log(`\n== Generating docs for ${id} (${repo}) ==`);
console.log(`source: ${src}`);
console.log(`dest  : ${destRoot}`);

// Start from a clean slate so stale files from previous runs can't leak through.
rmSync(destRoot, { recursive: true, force: true });
mkdirSync(destRoot, { recursive: true });

const blobUrl = (path) => `https://github.com/${repo}/blob/${branch}/${path.split(sep).join('/')}`;

/** Recursively walk `dir`, ignoring common junk and any segment in `ignored`. */
function walk(dir, base = dir, ignored = new Set(['.git', 'node_modules', '.venv', 'venv', '__pycache__', 'dist', 'build', '.next', '.cache', '.idea', '.vscode'])) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const full = join(dir, entry.name);
    const rel = relative(base, full);
    if (entry.isDirectory()) {
      out.push({ rel, isDir: true });
      out.push(...walk(full, base, ignored));
    } else if (entry.isFile()) {
      out.push({ rel, isDir: false });
    }
  }
  return out;
}

const tree = walk(src);

// --- 1. intro.md from README ---------------------------------------------------
{
  const readme = ['README.md', 'readme.md', 'README.MD'].map((n) => join(src, n)).find(existsSync);
  const frontmatter = `---\nsidebar_position: 1\ntitle: Introduction\n---\n\n`;
  let body;
  if (readme) {
    const repoName = repo.split('/')[1];
    body = readFileSync(readme, 'utf8');
    // If the README starts with an h1, keep it; otherwise prepend one.
    if (!/^#\s+/m.test(body.split('\n').slice(0, 5).join('\n'))) {
      body = `# ${repoName}\n\n${body}`;
    }
    body = `${frontmatter}${body}\n\n---\n\n*Source: [${repo}/${basename(readme)}](${blobUrl(basename(readme))})*\n`;
  } else {
    body = `${frontmatter}# ${repo.split('/')[1]}\n\n> No top-level README.md was found in [${repo}](https://github.com/${repo}).\n`;
  }
  writeFileSync(join(destRoot, 'intro.md'), body);
  console.log(`wrote ${relative(process.cwd(), join(destRoot, 'intro.md'))}`);
}

// --- 2. Mirror other *.md files into reference/ --------------------------------
{
  const markdownFiles = tree.filter((t) => !t.isDir && /\.md$/i.test(t.rel) && !/^readme\.md$/i.test(t.rel));
  if (markdownFiles.length > 0) {
    const refRoot = join(destRoot, 'reference');
    mkdirSync(refRoot, { recursive: true });
    writeFileSync(
      join(refRoot, '_category_.json'),
      JSON.stringify({ label: 'Reference Docs', position: 5, link: { type: 'generated-index' } }, null, 2) + '\n',
    );
    for (const { rel } of markdownFiles) {
      const from = join(src, rel);
      const to = join(refRoot, rel);
      mkdirSync(dirname(to), { recursive: true });
      // Sanitize frontmatter collisions by wrapping body with a banner.
      const content = readFileSync(from, 'utf8');
      const header = `> Mirrored from [${repo}/${rel.split(sep).join('/')}](${blobUrl(rel)}). Edits made here will be overwritten on the next sync.\n\n`;
      writeFileSync(to, header + content);
    }
    console.log(`mirrored ${markdownFiles.length} markdown file(s) into reference/`);
  }
}

// --- 3. Project structure overview --------------------------------------------
{
  const overviewDir = join(destRoot, 'overview');
  mkdirSync(overviewDir, { recursive: true });
  writeFileSync(
    join(overviewDir, '_category_.json'),
    JSON.stringify({ label: 'Overview', position: 2, link: { type: 'generated-index' } }, null, 2) + '\n',
  );

  const MAX_ENTRIES = 400;
  const lines = [];
  lines.push(`---\nsidebar_position: 1\ntitle: Project Structure\n---\n`);
  lines.push(`# Project Structure\n`);
  lines.push(`Auto-generated from the [\`${repo}\`](https://github.com/${repo}) repository (\`${branch}\` branch).\n`);
  lines.push(`## File tree\n`);
  lines.push('```text');
  let shown = 0;
  for (const entry of tree) {
    if (shown >= MAX_ENTRIES) {
      lines.push(`... (${tree.length - shown} more entries omitted)`);
      break;
    }
    const depth = entry.rel.split(sep).length - 1;
    const pad = '  '.repeat(depth);
    const name = entry.rel.split(sep).pop();
    lines.push(`${pad}${entry.isDir ? `${name}/` : name}`);
    shown++;
  }
  lines.push('```');
  lines.push('');
  writeFileSync(join(overviewDir, 'project-structure.md'), lines.join('\n') + '\n');
  console.log(`wrote overview/project-structure.md (${shown} entries)`);
}

// --- 4. Language-aware API reference ------------------------------------------
const apiRoot = join(destRoot, 'api');
let wroteAnyApi = false;

function tryRun(cmd, args, opts = {}) {
  console.log(`$ ${cmd} ${args.join(' ')} (cwd=${opts.cwd || process.cwd()})`);
  const res = spawnSync(cmd, args, { stdio: 'inherit', ...opts });
  return res.status === 0;
}

// --- 4a. TypeScript -> TypeDoc ------------------------------------------------
function generateTypeScriptDocs() {
  const tsconfig = ['tsconfig.json', 'tsconfig.base.json'].map((n) => join(src, n)).find(existsSync);
  if (!tsconfig) return false;

  // Find a reasonable entry point. Priority: src/index.ts(x), index.ts(x), src/main.ts(x).
  const candidates = [
    'src/index.ts', 'src/index.tsx',
    'index.ts', 'index.tsx',
    'src/main.ts', 'src/main.tsx',
  ];
  const entry = candidates.map((c) => join(src, c)).find(existsSync);
  if (!entry) {
    console.log('TypeScript docs: no conventional entry point found; skipping TypeDoc.');
    return false;
  }

  mkdirSync(apiRoot, { recursive: true });
  const out = join(apiRoot, 'typescript');
  const ok = tryRun(
    'npx',
    [
      '--yes', 'typedoc@0.26',
      '--plugin', 'typedoc-plugin-markdown',
      '--out', out,
      '--tsconfig', tsconfig,
      '--entryPoints', entry,
      '--readme', 'none',
      '--githubPages', 'false',
      '--hideBreadcrumbs', 'true',
      '--hidePageHeader', 'true',
    ],
    { cwd: src },
  );
  if (!ok) {
    console.warn('::warning::TypeDoc run failed; skipping TypeScript API docs.');
    rmSync(out, { recursive: true, force: true });
    return false;
  }
  writeFileSync(
    join(out, '_category_.json'),
    JSON.stringify({ label: 'TypeScript API', position: 1, link: { type: 'generated-index' } }, null, 2) + '\n',
  );
  console.log('wrote api/typescript/');
  return true;
}

// --- 4b. Python -> pdoc -------------------------------------------------------
function generatePythonDocs() {
  // Look for a directory that contains __init__.py, then treat that as the package root.
  const pkgDirs = [];
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (['tests', 'test', 'node_modules', '.venv', 'venv', 'build', 'dist', '__pycache__'].includes(entry.name)) continue;
    const init = join(src, entry.name, '__init__.py');
    if (existsSync(init)) pkgDirs.push(entry.name);
  }
  // Also accept a top-level app/ or backend/app/ package that's common in FastAPI projects.
  for (const p of ['app', 'backend/app', 'src']) {
    if (pkgDirs.includes(p)) continue;
    if (existsSync(join(src, p, '__init__.py'))) pkgDirs.push(p);
  }
  if (pkgDirs.length === 0) {
    console.log('Python docs: no detectable Python package (no __init__.py found); skipping pdoc.');
    return false;
  }

  // Install pdoc and the project's requirements so imports work. Best-effort.
  const venvDir = join(src, '.pdoc-venv');
  const pipInstall = (pkgs, opts = {}) => tryRun('python3', ['-m', 'pip', 'install', '--quiet', '--disable-pip-version-check', ...pkgs], opts);

  try {
    if (!pipInstall(['pdoc'])) {
      console.warn('::warning::pip install pdoc failed; skipping Python API docs.');
      return false;
    }
    // Try to install repo deps if a requirements file is present. These are best-effort
    // so pdoc can import the modules; failures are non-fatal and we continue without them.
    const reqFiles = [
      'requirements.txt',
      'backend/requirements.txt',
      'app/requirements.txt',
    ].map((p) => join(src, p)).filter(existsSync);
    for (const req of reqFiles) {
      const ok = pipInstall(['-r', req]);
      if (!ok) console.warn(`::warning::pip install -r ${req} failed; pdoc imports may fail for some modules.`);
    }
  } catch (err) {
    console.warn(`::warning::Python dependency install errored: ${err.message}`);
  }

  mkdirSync(apiRoot, { recursive: true });
  const out = join(apiRoot, 'python');
  const modules = pkgDirs;

  // pdoc emits Markdown when `--format markdown` is passed (pdoc 14+).
  const ok = tryRun(
    'python3',
    ['-m', 'pdoc', '--output-directory', out, '--format', 'markdown', ...modules],
    { cwd: src },
  );
  if (!ok) {
    console.warn('::warning::pdoc run failed; skipping Python API docs.');
    rmSync(out, { recursive: true, force: true });
    return false;
  }
  writeFileSync(
    join(out, '_category_.json'),
    JSON.stringify({ label: 'Python API', position: 2, link: { type: 'generated-index' } }, null, 2) + '\n',
  );
  console.log('wrote api/python/');
  return true;
}

try {
  if (generateTypeScriptDocs()) wroteAnyApi = true;
} catch (err) {
  console.warn(`::warning::TypeScript doc generation threw: ${err.message}`);
}
try {
  if (generatePythonDocs()) wroteAnyApi = true;
} catch (err) {
  console.warn(`::warning::Python doc generation threw: ${err.message}`);
}

if (wroteAnyApi) {
  writeFileSync(
    join(apiRoot, '_category_.json'),
    JSON.stringify({ label: 'API Reference', position: 4, link: { type: 'generated-index' } }, null, 2) + '\n',
  );
}

console.log(`== done: ${id} ==\n`);
