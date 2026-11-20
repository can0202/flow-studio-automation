import fs from 'fs';
import path from 'path';

const localAppData = process.env.LOCALAPPDATA || '';
const base = path.join(localAppData, 'CapCut', 'User Data', 'Projects', 'com.lveditor.draft');

// Let's inspect all drafts in root_meta_info.json
const rootMetaPath = path.join(base, 'root_meta_info.json');
const rootData = JSON.parse(fs.readFileSync(rootMetaPath, 'utf8'));
console.log('All draft names in root_meta_info:');
for (const d of rootData.all_draft_store || []) {
  console.log(`- name: ${d.draft_name}, id: ${d.draft_id}, fold: ${d.draft_fold_path}`);
}

// Let's check AutoDraft_1d91d5b7
const dDir = path.join(base, 'AutoDraft_1d91d5b7');
if (fs.existsSync(dDir)) {
  const content = JSON.parse(fs.readFileSync(path.join(dDir, 'draft_content.json'), 'utf8'));
  console.log('\n--- AutoDraft_1d91d5b7 content summary ---');
  console.log('materials keys:', Object.keys(content.materials || {}));
  console.log('videos count:', content.materials?.videos?.length);
  console.log('audios count:', content.materials?.audios?.length);
  console.log('texts count:', content.materials?.texts?.length);
  if (content.materials?.videos?.[0]) {
    console.log('first video material:', JSON.stringify(content.materials.videos[0], null, 2).slice(0, 500));
  }
  console.log('tracks:');
  for (const t of content.tracks || []) {
    console.log(`  track type: ${t.type}, segments count: ${t.segments?.length}`);
  }
}
