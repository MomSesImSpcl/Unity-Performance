// PostToolUse hook: after a .cs file is written or edited, tell Claude to apply code-standards.
// Skill triggering by description alone loads code-standards on too few C# tasks (see evals/).
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
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      additionalContext:
        `C# file changed: ${filePath}. If the unity-perf:code-standards skill is not loaded yet this session, ` +
        'invoke it now. Before finishing, check your C# changes against its write-time rules and fix any violation. ' +
        'Skip this if you already did that check for these changes.',
    },
  }));
});
