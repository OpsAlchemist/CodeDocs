#!/usr/bin/env node
/**
 * Generate documentation for a source repository checked out under
 * `temp/<id>/`, writing the result into `docs/<id>/`.
 *
 * Strategy:
 *   - Find the repo's primary doc folder (a directory containing several
 *     Markdown files; defaults: documentations/, docs/, doc/).
 *   - Each Markdown file in that folder becomes a top-level sidebar entry
 *     labelled by its H1 (or a humanized filename fallback).
 *   - Subfolders containing Markdown become categories.
 *   - The repo's root README.md becomes the project intro.
 *   - A separate "Project Layout" page lists the file tree.
 *   - Optional language-aware API references run when entry points exist.
 */
import { execSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { dirname, join, relative, resolve, sep, basename, extname } from 'node:path';
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
const src = values.src ? resolve(values.src) : null;
const destRoot = resolve(join(values.dest, id));
const branch = values.branch;

if (!id || !repo || !src) {
  console.error(
    'usage: generate-project-docs.mjs --id <id> --repo <owner/repo> --src <path> [--dest docs] [--branch main]',
  );
  process.exit(2);
}

if (!existsSync(src)) {
  console.warn(`::warning::source directory ${src} does not exist; skipping ${id}`);
  process.exit(0);
}

console.log(`\n== Generating docs for ${id} (${repo}) ==`);
console.log(`source: ${src}`);
console.log(`dest  : ${destRoot}`);

rmSync(destRoot, { recursive: true, force: true });
mkdirSync(destRoot, { recursive: true });

const blobUrl = (relPath) =>
  `https://github.com/${repo}/blob/${branch}/${relPath.split(sep).join('/')}`;

const IGNORED_DIRS = new Set([
  '.git',
  'node_modules',
  '.venv',
  'venv',
  '__pycache__',
  'dist',
  'build',
  '.next',
  '.cache',
  '.idea',
  '.vscode',
  '.pdoc-venv',
]);

function walk(dir, base = dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (IGNORED_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    const rel = relative(base, full);
    if (entry.isDirectory()) {
      out.push({ rel, isDir: true });
      out.push(...walk(full, base));
    } else if (entry.isFile()) {
      out.push({ rel, isDir: false });
    }
  }
  return out;
}

/** Humanize a filename like `API_REFERENCE` -> `API Reference`. */
function humanize(name) {
  const base = name.replace(/\.[^.]+$/, '');
  // Common acronyms we want to keep uppercase.
  const ACRONYMS = new Set(['API', 'AWS', 'CLI', 'CSS', 'HTML', 'HTTP', 'HTTPS', 'JSON', 'SDK', 'SQL', 'UI', 'URL', 'YAML']);
  return base
    .replace(/[-_]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      const upper = word.toUpperCase();
      if (ACRONYMS.has(upper)) return upper;
      if (word.length <= 3 && /^[A-Z]+$/.test(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

/** Strip leading H1 from a markdown body and return both pieces. */
function splitTitleFromBody(content) {
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') continue;
    const m = line.match(/^#\s+(.+?)\s*$/);
    if (m) {
      return { title: m[1].trim(), body: lines.slice(i + 1).join('\n').replace(/^\n+/, '') };
    }
    break;
  }
  return { title: null, body: content };
}

/** Slug-friendly id for Docusaurus from a relative source path. */
function toDocId(relPath) {
  return relPath
    .split(sep)
    .join('/')
    .replace(/\.md$/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9_/-]+/g, '-');
}

/** Convert raw doc content to MDX-safe content with Docusaurus frontmatter. */
function buildDoc({ relSourcePath, sidebarPosition, title, body, sourceUrl, sidebarLabel }) {
  const safeTitle = (title || humanize(basename(relSourcePath))).replace(/"/g, '\\"');
  const safeLabel = (sidebarLabel || safeTitle).replace(/"/g, '\\"');
  const rawId = toDocId(relSourcePath).split('/').pop() || 'index';
  const cleanId = rawId.replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'index';
  const frontmatter = [
    '---',
    `id: ${cleanId}`,
    `title: "${safeTitle}"`,
    `sidebar_label: "${safeLabel}"`,
    `sidebar_position: ${sidebarPosition}`,
    '---',
    '',
  ].join('\n');
  const banner = sourceUrl
    ? `> Sourced from [\`${repo}/${relSourcePath.split(sep).join('/')}\`](${sourceUrl}). Edits made here are overwritten on every sync.\n\n`
    : '';
  const cleanBody = sanitizeMarkdown(body, relSourcePath);
  return `${frontmatter}\n# ${title || humanize(basename(relSourcePath))}\n\n${banner}${cleanBody}\n`;
}

/**
 * Cleanup pass to keep MDX happy and avoid broken-link warnings:
 *   - rewrite ```` ```mermaid ```` fences so the theme picks them up.
 *   - convert markdown links to local files that don't exist in the doc tree
 *     into bare code spans, so Docusaurus doesn't flag them as broken.
 */
function sanitizeMarkdown(content, relSourcePath) {
  let out = content;

  // Normalize a stray ```mermaid graph TD``` (single line) into a clean fence.
  out = out.replace(/```mermaid\s+graph/gi, '```mermaid\ngraph');

  // Rewrite relative .md links so they map to the lowercased filename used by
  // the generator. Keeps cross-references working between docs in the same
  // primary doc folder.
  out = out.replace(/\[([^\]]+)\]\(\.?\/?([A-Za-z0-9_./-]+\.md)(#[^)]*)?\)/g, (full, label, target, hash) => {
    if (/^https?:/i.test(target)) return full;
    const lowered = target.replace(/[^A-Za-z0-9_/.-]+/g, '-').toLowerCase();
    const noExt = lowered.replace(/\.md$/i, '');
    return `[${label}](./${noExt}${hash || ''})`;
  });

  // Replace remaining links that point at non-doc local files (env files,
  // source files, anchors in other repos) with code spans so Docusaurus
  // doesn't flag them as broken.
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (full, label, target) => {
    if (/^(https?:|mailto:|tel:|#)/i.test(target)) return full;
    if (/\.(md|mdx)(#.*)?$/i.test(target)) return full;
    return `\`${label}\``;
  });

  return out;
}

/** Return the directory most likely to be the project's primary doc folder. */
function findPrimaryDocDir(allEntries) {
  const candidates = ['documentations', 'documentation', 'docs', 'doc', 'wiki'];
  for (const cand of candidates) {
    const has = allEntries.some(
      (e) => e.isDir && e.rel.split(sep)[0]?.toLowerCase() === cand && e.rel.split(sep).length === 1,
    );
    if (!has) continue;
    // Confirm it has at least one *.md file inside.
    const hasMd = allEntries.some(
      (e) =>
        !e.isDir &&
        e.rel.split(sep)[0]?.toLowerCase() === cand &&
        /\.md$/i.test(e.rel) &&
        !/^readme\.md$/i.test(basename(e.rel)),
    );
    if (hasMd) return cand;
  }
  return null;
}

const tree = walk(src);
const primaryDocDir = findPrimaryDocDir(tree);
console.log(`primary doc folder: ${primaryDocDir || '(none — using repo root scan)'}`);

// --- 1. intro.md from README -------------------------------------------------
function writeIntroFromReadme() {
  const readme = ['README.md', 'readme.md', 'README.MD']
    .map((n) => join(src, n))
    .find(existsSync);
  let body;
  let title;
  if (readme) {
    const raw = readFileSync(readme, 'utf8');
    const split = splitTitleFromBody(raw);
    title = split.title || repo.split('/')[1];
    body = split.body;
  } else {
    title = repo.split('/')[1];
    body = `> No top-level README.md was found in [${repo}](https://github.com/${repo}).`;
  }
  // We deliberately use "intro" as the source path so the resulting doc id
  // and slug both become `intro` — that matches the navbar/footer links.
  writeFileSync(
    join(destRoot, 'intro.md'),
    buildDoc({
      relSourcePath: 'intro.md',
      sidebarPosition: 1,
      title: 'Introduction',
      sidebarLabel: 'Introduction',
      sourceUrl: readme ? blobUrl('README.md') : null,
      body: `# ${title}\n\n${body}`,
    }),
  );
  console.log('wrote intro.md');
}
writeIntroFromReadme();

// --- 2. Primary doc folder -> top-level pages --------------------------------
let nextPosition = 2;
const writtenFiles = new Set(['intro.md']);

function copyMarkdownFile(absSrc, relSrc, options = {}) {
  const raw = readFileSync(absSrc, 'utf8');
  const { title, body } = splitTitleFromBody(raw);
  const finalTitle = options.title || title || humanize(basename(relSrc));
  const sidebarLabel = options.sidebarLabel || finalTitle;
  const targetRel = options.targetRel || `${basename(relSrc, '.md').toLowerCase().replace(/[^a-z0-9_-]+/g, '-')}.md`;
  const dest = join(destRoot, options.subdir || '', targetRel);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(
    dest,
    buildDoc({
      relSourcePath: relSrc,
      sidebarPosition: options.sidebarPosition ?? nextPosition++,
      title: finalTitle,
      sidebarLabel,
      sourceUrl: blobUrl(relSrc),
      body,
    }),
  );
  writtenFiles.add(relative(destRoot, dest));
  return dest;
}

/**
 * Curated ordering for common documentation files. Anything not listed
 * falls in alphabetical order after these.
 */
const PREFERRED_ORDER = [
  /^getting[-_]?started/i,
  /^architecture/i,
  /^api[-_]?reference/i,
  /^api/i,
  /^backend/i,
  /^frontend/i,
  /^database/i,
  /^data[-_]?model/i,
  /^configuration/i,
  /^environment/i,
  /^deployment/i,
  /^operations/i,
  /^monitoring/i,
  /^security/i,
  /^testing/i,
  /^contributing/i,
  /^roadmap/i,
  /^improvements?/i,
  /^changelog/i,
  /^faq/i,
];

function orderRank(filename) {
  const base = basename(filename, extname(filename));
  for (let i = 0; i < PREFERRED_ORDER.length; i++) {
    if (PREFERRED_ORDER[i].test(base)) return i;
  }
  return PREFERRED_ORDER.length;
}

function processPrimaryDocFolder() {
  if (!primaryDocDir) return;
  const dirAbs = join(src, primaryDocDir);
  const items = readdirSync(dirAbs, { withFileTypes: true });

  const mdFiles = items
    .filter((d) => d.isFile() && /\.md$/i.test(d.name) && !/^readme\.md$/i.test(d.name))
    .map((d) => d.name);
  const subdirs = items.filter((d) => d.isDirectory() && !IGNORED_DIRS.has(d.name)).map((d) => d.name);

  mdFiles.sort((a, b) => orderRank(a) - orderRank(b) || a.localeCompare(b));

  for (const fn of mdFiles) {
    copyMarkdownFile(join(dirAbs, fn), join(primaryDocDir, fn));
  }

  for (const dn of subdirs) {
    processSubdirAsCategory(join(dirAbs, dn), join(primaryDocDir, dn), dn);
  }
}

function processSubdirAsCategory(absDir, relDir, name) {
  const items = walk(absDir, absDir).filter((e) => !e.isDir && /\.md$/i.test(e.rel));
  if (items.length === 0) return;
  const subdir = name.toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
  const categoryPosition = nextPosition++;
  const catDir = join(destRoot, subdir);
  mkdirSync(catDir, { recursive: true });
  writeFileSync(
    join(catDir, '_category_.json'),
    JSON.stringify(
      { label: humanize(name), position: categoryPosition, link: { type: 'generated-index' } },
      null,
      2,
    ) + '\n',
  );

  // Sort by curated order, then alphabetically. Demote README to last so it
  // becomes a brief intro at the bottom of the category if at all.
  items.sort((a, b) => {
    const aReadme = /^readme\.md$/i.test(basename(a.rel));
    const bReadme = /^readme\.md$/i.test(basename(b.rel));
    if (aReadme !== bReadme) return aReadme ? 1 : -1;
    return orderRank(a.rel) - orderRank(b.rel) || a.rel.localeCompare(b.rel);
  });

  let local = 1;
  for (const item of items) {
    // Build a clean target filename: keep folder structure but use .md extension.
    const safeName = sanitizeFilename(basename(item.rel));
    const safeDir = item.rel.includes(sep)
      ? dirname(item.rel)
          .split(sep)
          .map((part) => part.toLowerCase().replace(/[^a-z0-9_-]+/g, '-'))
          .join('/')
      : '';
    const targetRel = safeDir ? `${safeDir}/${safeName}` : safeName;

    // README inside a subfolder is usually a generic "this folder" intro;
    // we still include it but with a friendlier label.
    const isReadme = /^readme\.md$/i.test(basename(item.rel));
    copyMarkdownFile(join(absDir, item.rel), join(relDir, item.rel), {
      subdir,
      targetRel,
      sidebarPosition: local++,
      sidebarLabel: isReadme ? `${humanize(name)} Overview` : undefined,
      title: isReadme ? `${humanize(name)} Overview` : undefined,
    });
  }
}

function sanitizeFilename(name) {
  return name
    .toLowerCase()
    .replace(/\.md$/i, '')
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') + '.md';
}

processPrimaryDocFolder();

// --- 3. Other top-level Markdown folders (e.g. cloud/, deploy/) --------------
function processAdditionalDocFolders() {
  const seen = new Set([primaryDocDir].filter(Boolean).map((s) => s.toLowerCase()));
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (IGNORED_DIRS.has(entry.name)) continue;
    if (seen.has(entry.name.toLowerCase())) continue;
    const dirAbs = join(src, entry.name);
    const mdFiles = walk(dirAbs, dirAbs).filter(
      (e) => !e.isDir && /\.md$/i.test(e.rel) && !/^readme\.md$/i.test(basename(e.rel)),
    );
    if (mdFiles.length === 0) continue;
    processSubdirAsCategory(dirAbs, entry.name, entry.name);
  }
}

processAdditionalDocFolders();

// --- 4. Project layout overview ---------------------------------------------
function writeProjectLayout() {
  const lines = [];
  const MAX = 250;
  let count = 0;
  for (const entry of tree) {
    if (count >= MAX) {
      lines.push(`... (${tree.length - count} more entries omitted)`);
      break;
    }
    const depth = entry.rel.split(sep).length - 1;
    const pad = '  '.repeat(depth);
    const name = entry.rel.split(sep).pop();
    lines.push(`${pad}${entry.isDir ? `${name}/` : name}`);
    count++;
  }
  const body = `Auto-generated from the [\`${repo}\`](https://github.com/${repo}) repository.\n\n## File tree\n\n\`\`\`text\n${lines.join('\n')}\n\`\`\`\n`;
  writeFileSync(
    join(destRoot, 'project-layout.md'),
    buildDoc({
      relSourcePath: '.',
      sidebarPosition: 99,
      title: 'Project Layout',
      sidebarLabel: 'Project Layout',
      sourceUrl: `https://github.com/${repo}`,
      body,
    }),
  );
  console.log('wrote project-layout.md');
}
writeProjectLayout();

// --- 5. Language-aware API references ---------------------------------------
function tryRun(cmd, args, opts = {}) {
  console.log(`$ ${cmd} ${args.join(' ')} (cwd=${opts.cwd || process.cwd()})`);
  const res = spawnSync(cmd, args, { stdio: 'inherit', ...opts });
  return res.status === 0;
}

function generatePythonDocs() {
  const candidates = [];
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    if (!entry.isDirectory() || IGNORED_DIRS.has(entry.name)) continue;
    if (existsSync(join(src, entry.name, '__init__.py'))) candidates.push(entry.name);
  }
  for (const p of ['app', 'backend/app', 'src']) {
    if (!candidates.includes(p) && existsSync(join(src, p, '__init__.py'))) candidates.push(p);
  }
  if (candidates.length === 0) {
    console.log('python: no __init__.py packages detected; skipping pdoc.');
    return false;
  }

  if (!tryRun('python3', ['-m', 'pip', 'install', '--quiet', '--disable-pip-version-check', 'pdoc'])) {
    console.warn('::warning::pip install pdoc failed; skipping Python API docs.');
    return false;
  }
  for (const req of ['requirements.txt', 'backend/requirements.txt'].map((p) => join(src, p)).filter(existsSync)) {
    if (!tryRun('python3', ['-m', 'pip', 'install', '--quiet', '--disable-pip-version-check', '-r', req])) {
      console.warn(`::warning::pip install -r ${req} failed; pdoc imports may fail.`);
    }
  }

  const out = join(destRoot, 'api-python');
  mkdirSync(out, { recursive: true });
  if (!tryRun('python3', ['-m', 'pdoc', '--output-directory', out, '--format', 'markdown', ...candidates], { cwd: src })) {
    console.warn('::warning::pdoc run failed; skipping Python API docs.');
    rmSync(out, { recursive: true, force: true });
    return false;
  }
  writeFileSync(
    join(out, '_category_.json'),
    JSON.stringify({ label: 'Python API', position: 50, link: { type: 'generated-index' } }, null, 2) + '\n',
  );
  console.log('wrote api-python/');
  return true;
}

try {
  generatePythonDocs();
} catch (err) {
  console.warn(`::warning::Python doc generation threw: ${err.message}`);
}

console.log(`== done: ${id} ==\n`);
