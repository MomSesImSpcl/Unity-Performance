// PostToolUse hook: after a .cs file is written or edited, tell Claude to apply code-standards.
// Skill triggering by description alone loads code-standards on too few C# tasks (see evals/).
const path = require('path');
let input = '';
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  let filePath = '';
  try {
    filePath = JSON.parse(input).tool_input?.file_path ?? '';
  } catch {
    return; // Malformed input: stay silent rather than block the edit.
  }
  if (!filePath.toLowerCase().endsWith('.cs')) return;
  const zeroAllocPatterns = path.join(process.env.CLAUDE_PLUGIN_ROOT ?? path.join(__dirname, '..'),
    'skills', 'csharp-zero-gc', 'references', 'zero-alloc-patterns.md');
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      additionalContext:
        `C# file changed: ${filePath}. If the unity-perf:code-standards skill is not loaded yet this session, ` +
        'invoke it now. Before finishing, check your C# changes against its write-time rules and fix any violation. ' +
        'If the changed code runs per frame or often (Update/FixedUpdate/LateUpdate, per-frame loops, spawning, ' +
        `pooling, physics or UI refresh), also apply the patterns in ${zeroAllocPatterns}. ` +
        'If the code looks like it needs more than that, add one line to your reply suggesting a ' +
        '/unity-perf:unity-performance pass or a /unity-perf:csharp-zero-gc plan; do not start either yourself. ' +
        'Skip all of this if you already did it for these changes.',
    },
  }));
});
