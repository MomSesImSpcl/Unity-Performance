// Run from the repository root: node scripts/validate-skills.cjs
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const errors = [];
let references = 0;
for (const name of fs.readdirSync('skills')) {
  const dir = path.join('skills', name);
  const entry = fs.readFileSync(path.join(dir, 'SKILL.md'), 'utf8');
  const front = entry.match(/^---\r?\nname: ([a-z0-9-]+)\r?\ndescription: (.+)\r?\n---/);
  if (!front || front[1] !== name || front[2].length > 1024) errors.push(`${name}: invalid metadata`);
  if (entry.split('\n').length >= 500) errors.push(`${name}: entry point too long`);
  for (const file of fs.readdirSync(path.join(dir, 'references'))) {
    references++;
    if (!entry.includes(`(references/${file})`)) errors.push(`${name}: missing direct link to ${file}`);
    const content = fs.readFileSync(path.join(dir, 'references', file), 'utf8');
    if (content.split('\n').length > 100 && !/^## Contents$/m.test(content)) errors.push(`${name}/${file}: missing contents`);
  }
  for (const file of ['SKILL.md', ...fs.readdirSync(path.join(dir, 'references')).map(f => `references/${f}`)]) {
    const full = path.join(dir, file);
    for (const match of fs.readFileSync(full, 'utf8').matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      const target = match[1].split('#')[0];
      if (target && !/^[a-z]+:\/\//i.test(target) && !fs.existsSync(path.resolve(path.dirname(full), target))) errors.push(`${full}: broken link ${target}`);
    }
  }
}
for (const record of JSON.parse(fs.readFileSync('evals/content-preservation.json', 'utf8'))) {
  const restored = fs.readFileSync(record.file, 'utf8').replace(/\n<!-- navigation:start -->[\s\S]*?<!-- navigation:end -->\n/, '');
  const hash = crypto.createHash('sha256').update(restored).digest('hex');
  if (hash !== record.originalSha256) errors.push(`${record.file}: content changed outside navigation`);
}
for (const file of ['plugin.config.json', '.claude-plugin/plugin.json', '.codex-plugin/plugin.json', '.claude-plugin/marketplace.json']) {
  try { JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { errors.push(`${file}: ${e.message}`); }
}
console.log(JSON.stringify({references, errors}, null, 2));
process.exitCode = errors.length ? 1 : 0;
