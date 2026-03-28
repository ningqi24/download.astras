const fs = require('fs/promises');
const fetch = require('node-fetch');

const OWNER = 'astraeditor';
const REPO = 'desktop';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

async function fetchLatestRelease() {
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/releases/latest`;
  const headers = GITHUB_TOKEN ? { Authorization: `token ${GITHUB_TOKEN}` } : {};
  const res = await fetch(url, { headers });

  if (res.status === 404) {
    console.log('No release found for this repository.');
    return null;
  }
  if (!res.ok) {
    throw new Error(`GitHub API error: ${res.status} ${await res.text()}`);
  }
  return await res.json();
}

function transformAssets(assets) {
  if (!assets || assets.length === 0) return [];
  return assets.map(asset => ({
    name: asset.name,
    size: asset.size,
    original_url: asset.browser_download_url
  }));
}

async function main() {
  try {
    const release = await fetchLatestRelease();

    let output = {
      lastUpdated: new Date().toISOString(),
      hasRelease: !!release,
    };

    if (release) {
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

      output.release = {
        tag_name: release.tag_name,
        name: release.name,
        published_at: release.published_at,
        prerelease: release.prerelease,
        assets: transformAssets(release.assets).concat(sourceAssets)
      };
    } else {
      output.release = null;
    }

    await fs.mkdir('public', { recursive: true });
    await fs.writeFile('public/releases.json', JSON.stringify(output, null, 2));
    console.log('releases.json generated successfully');
    if (release) {
      console.log(`Total assets: ${release.assets.length}`);
      release.assets.forEach(asset => {
        console.log(`   - ${asset.name}`);
      });
      console.log('Source code URLs added:');
      console.log(`   - ${release.tag_name}-source.tar.gz`);
      console.log(`   - ${release.tag_name}-source.zip`);
    }
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

main();