const fs = require('fs');
const route = fs.readFileSync('app/api/content/generate-pro/route.ts', 'utf-8');
const contentRoute = fs.readFileSync('app/api/content/route.ts', 'utf-8');
const types = fs.readFileSync('lib/types.ts', 'utf-8');
const gen = fs.readFileSync('lib/content-generator-pro.ts', 'utf-8');
const ui = fs.readFileSync('components/ContentPromptStudio.tsx', 'utf-8');

const checks = [
  // Critical #1: QA Gate in both modes
  ['CRITICAL-1a  applyQAGate() shared function exists',    route.includes('function applyQAGate(')],
  ['CRITICAL-1b  JSON mode calls applyQAGate()',           route.includes('const gate = applyQAGate(') && route.includes('handleJSON')],
  ['CRITICAL-1c  SSE mode calls applyQAGate()',            (route.match(/const gate = applyQAGate\(/g)||[]).length >= 2],
  ['CRITICAL-1d  Inline duplicate gate removed from SSE',  !route.includes('let saveStatus:')],

  // High #2: Status contract
  ['HIGH-2a  qa_warning in ContentStatus type',            types.includes('\"qa_warning\"')],
  ['HIGH-2b  qa_failed in ContentStatus type',             types.includes('\"qa_failed\"')],
  ['HIGH-2c  ContentStatus imported in PATCH route',       contentRoute.includes('import type { ContentStatus }')],
  ['HIGH-2d  PATCH validStatuses includes qa_warning',     contentRoute.includes('"qa_warning"')],
  ['HIGH-2e  PATCH validStatuses includes qa_failed',      contentRoute.includes('"qa_failed"')],

  // Medium #3: Next button no side-effect
  ['MEDIUM-3  Next button navigate-only (no loadManualStepPrompt)', !ui.includes('loadManualStepPrompt((stepNum + 1)')],

  // Medium #4: Dead imports removed
  ['MEDIUM-4a  selectTopPosts NOT directly imported',      !gen.includes('  selectTopPosts,\n')],
  ['MEDIUM-4b  compressPostForPrompt NOT directly imported',!gen.includes('  compressPostForPrompt,\n')],
  ['MEDIUM-4c  audit comment explains data flow',          gen.includes('selectTopPosts and compressPostForPrompt are used INTERNALLY')],

  // Low #5: syncRun step name updated
  ['LOW-5  syncRun emits "Deep Research (sync)"',          route.includes('"Deep Research (sync)"')],
];

let pass = 0, fail = 0;
for (const [name, result] of checks) {
  const icon = result ? 'PASS' : 'FAIL';
  if (result) pass++; else fail++;
  console.log(`[${icon}] ${name}`);
}
console.log(`\n${pass}/${pass+fail} checks passed${fail > 0 ? ' — ' + fail + ' FAILED' : ' — ALL GOOD'}`);
