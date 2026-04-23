import { themes as prismThemes } from 'prism-react-renderer';
import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

// Update these to match your GitHub organization / repo settings.
const ORG_NAME = 'OpsAlchemist';
const DOCS_REPO = 'CodeDocs';

const config: Config = {
  title: 'CodeDocs',
  tagline: 'Unified documentation for CostOps and OtakuVerse',
  favicon: 'img/favicon.ico',

  // Production URL. If you use a custom domain, set url to it and baseUrl to '/'.
  url: `https://${ORG_NAME}.github.io`,
  baseUrl: `/${DOCS_REPO}/`,

  organizationName: ORG_NAME,
  projectName: DOCS_REPO,
  deploymentBranch: 'gh-pages',
  trailingSlash: false,

  onBrokenLinks: 'warn',
  markdown: {
    hooks: {
      onBrokenMarkdownLinks: 'warn',
    },
  },

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        // The classic preset's built-in docs instance is disabled; we register
        // project-specific docs instances via plugins below.
        docs: false,
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  plugins: [
    [
      '@docusaurus/plugin-content-docs',
      {
        id: 'costops',
        path: 'docs/costops',
        routeBasePath: 'costops',
        sidebarPath: './sidebars/costops.ts',
        editUrl: `https://github.com/${ORG_NAME}/CostOps/edit/main/docs/`,
        // Uncomment to enable versioning for CostOps.
        // lastVersion: 'current',
        // versions: { current: { label: 'Next', path: 'next' } },
      },
    ],
    [
      '@docusaurus/plugin-content-docs',
      {
        id: 'otakuverse',
        path: 'docs/otakuverse',
        routeBasePath: 'otakuverse',
        sidebarPath: './sidebars/otakuverse.ts',
        editUrl: `https://github.com/${ORG_NAME}/OtakuVerse/edit/main/docs/`,
      },
    ],
  ],

  themeConfig: {
    image: 'img/social-card.png',
    colorMode: {
      defaultMode: 'light',
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'CodeDocs',
      logo: {
        alt: 'CodeDocs Logo',
        src: 'img/logo.svg',
      },
      items: [
        {
          type: 'docSidebar',
          docsPluginId: 'costops',
          sidebarId: 'costopsSidebar',
          position: 'left',
          label: 'CostOps',
        },
        {
          type: 'docSidebar',
          docsPluginId: 'otakuverse',
          sidebarId: 'otakuverseSidebar',
          position: 'left',
          label: 'OtakuVerse',
        },
        {
          href: `https://github.com/${ORG_NAME}`,
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Projects',
          items: [
            { label: 'CostOps', to: '/costops/intro' },
            { label: 'OtakuVerse', to: '/otakuverse/intro' },
          ],
        },
        {
          title: 'Community',
          items: [
            {
              label: 'GitHub',
              href: `https://github.com/${ORG_NAME}`,
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} ${ORG_NAME}. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['bash', 'json', 'yaml', 'python'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
