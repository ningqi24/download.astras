const fs = require('fs/promises');

const OWNER = 'astraeditor';
const REPO = 'desktop';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

async function fetchAllReleases() {
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/releases`;
  const headers = GITHUB_TOKEN ? { Authorization: `token ${GITHUB_TOKEN}` } : {};
  const res = await fetch(url, { headers });

  if (res.status === 404) {
    console.log('No release found for this repository.');
    return [];
  }
  if (!res.ok) {
    throw new Error(`GitHub API error: ${res.status} ${await res.text()}`);
  }
  return await res.json();
}

function extractSHA256FromBody(body, filename) {
  if (!body) return null;
  // Pattern 1: filename: <sha256>
  const escaped = filename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`${escaped}\\s*[:：]\\s*([a-fA-F0-9]{64})`, 'i'),
    new RegExp(`SHA256\\s*\\(${escaped}\\)\\s*[:：=]\\s*([a-fA-F0-9]{64})`, 'i'),
    new RegExp(`\\b([a-fA-F0-9]{64})\\s+${escaped}`, 'i'),
    new RegExp(`\\*\\*${escaped}\\*\\*\\s*[:：]\\s*([a-fA-F0-9]{64})`, 'i'),
  ];
  for (const pattern of patterns) {
    const match = body.match(pattern);
    if (match) return match[1].toLowerCase();
  }
  return null;
}

function transformAssets(assets, releaseBody) {
  if (!assets || assets.length === 0) return [];
  return assets.map(asset => {
    // Prefer GitHub API digest (format: "sha256:abc...") - available since 2025-06
    let sha256 = null;
    if (asset.digest && asset.digest.startsWith('sha256:')) {
      sha256 = asset.digest.slice(7);
    }
    // Fallback: try parsing release body
    if (!sha256) {
      sha256 = extractSHA256FromBody(releaseBody, asset.name);
    }
    const result = {
      name: asset.name,
      size: asset.size,
      original_url: asset.browser_download_url
    };
    if (sha256) result.sha256 = sha256;
    return result;
  });
}

async function main() {
  try {
    const releases = await fetchAllReleases();

    let output = {
      lastUpdated: new Date().toISOString(),
      hasRelease: releases.length > 0,
      releases: []
    };

    releases.forEach(release => {
      const sourceAssets = [
        {
          name: `${release.tag_name}-source.tar.gz`,
          size: 0,
          original_url: `https://github.com/${OWNER}/${REPO}/archive/refs/tags/${release.tag_name}.tar.gz`
        },
        {
          name: `${release.tag_name}-source.zip`,
          size: 0,
          original_url: `https://github.com/${OWNER}/${REPO}/archive/refs/tags/${release.tag_name}.zip`
        }
      ];

      output.releases.push({
        tag_name: release.tag_name,
        name: release.name,
        published_at: release.published_at,
        prerelease: release.prerelease,
        assets: transformAssets(release.assets, release.body).concat(sourceAssets)
      });
    });

    await fs.mkdir('public', { recursive: true });
    await fs.writeFile('public/releases.json', JSON.stringify(output, null, 2));
    console.log('releases.json generated successfully');
    console.log(`Total releases: ${releases.length}`);
    releases.forEach((release, index) => {
      console.log(`Release ${index + 1}: ${release.tag_name}`);
      console.log(`   Assets: ${release.assets.length}`);
    });
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

main();