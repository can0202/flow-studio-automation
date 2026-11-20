import fs from 'fs';
import path from 'path';

const localAppData = process.env.LOCALAPPDATA || '';
const base = path.join(localAppData, 'CapCut', 'User Data', 'Projects', 'com.lveditor.draft');
console.log('Drafts Base:', base);
console.log('Exists:', fs.existsSync(base));

if (fs.existsSync(base)) {
  const rootMetaPath = path.join(base, 'root_meta_info.json');
  console.log('root_meta_info.json exists:', fs.existsSync(rootMetaPath));
  if (fs.existsSync(rootMetaPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(rootMetaPath, 'utf8'));
      console.log('root_meta_info all_draft_store count:', data.all_draft_store?.length);
      if (data.all_draft_store?.length > 0) {
        console.log('First 2 entries in root_meta_info:');
        console.log(JSON.stringify(data.all_draft_store.slice(0, 2), null, 2));
      }
    } catch (e) {
      console.error('Error reading root_meta_info:', e.message);
    }
  }

  const entries = fs.readdirSync(base, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => ({
      name: d.name,
      stat: fs.statSync(path.join(base, d.name))
    }))
    .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);

  console.log('Top 5 drafts:');
  for (const item of entries.slice(0, 5)) {
    const dir = path.join(base, item.name);
    console.log(`\n=== Draft: ${item.name} (${item.stat.mtime.toISOString()}) ===`);
    const files = fs.readdirSync(dir);
    console.log('Files:', files.join(', '));
    
    // Check draft_content.json vs draft_meta_info.json
    const contentP = path.join(dir, 'draft_content.json');
    if (fs.existsSync(contentP)) {
      try {
        const c = JSON.parse(fs.readFileSync(contentP, 'utf8'));
        console.log('  draft_content: version=', c.version, 'new_version=', c.new_version, 'app_version=', c.platform?.app_version, 'tracks=', c.tracks?.length);
      } catch (e) {
        console.log('  draft_content error:', e.message);
      }
    }
    const metaP = path.join(dir, 'draft_meta_info.json');
    if (fs.existsSync(metaP)) {
      try {
        const m = JSON.parse(fs.readFileSync(metaP, 'utf8'));
        console.log('  draft_meta_info: draft_name=', m.draft_name, 'version=', m.draft_new_version);
      } catch (e) {
        console.log('  draft_meta_info error:', e.message);
      }
    }
  }
}

const appsDir = path.join(localAppData, 'CapCut', 'Apps');
if (fs.existsSync(appsDir)) {
  console.log('\nCapCut Apps versions:', fs.readdirSync(appsDir).join(', '));
}
