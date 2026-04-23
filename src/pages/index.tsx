import React from 'react';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';

export default function Home() {
  const { siteConfig } = useDocusaurusContext();
  return (
    <Layout title="Home" description={siteConfig.tagline}>
      <header style={{ padding: '4rem 1rem', textAlign: 'center' }}>
        <h1 style={{ fontSize: '2.5rem' }}>{siteConfig.title}</h1>
        <p style={{ fontSize: '1.2rem' }}>{siteConfig.tagline}</p>
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: '2rem', flexWrap: 'wrap' }}>
          <Link className="button button--primary button--lg" to="/costops/intro">
            CostOps Docs
          </Link>
          <Link className="button button--secondary button--lg" to="/otakuverse/intro">
            OtakuVerse Docs
          </Link>
        </div>
      </header>
    </Layout>
  );
}
