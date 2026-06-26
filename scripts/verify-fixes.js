const fs = require('fs');
const ui = fs.readFileSync('components/ContentPromptStudio.tsx', 'utf-8');
const route = fs.readFileSync('app/api/content/generate-pro/route.ts', 'utf-8');

const checks = [
  // UI checks
  ['UI-1  Header text 5 step pipeline',   ui.includes('Engine 5 b\u01b0\u1edbc chuy\u00ean bi\u1ec7t')],
  ['UI-2  Card subtitle 5 step',          ui.includes('Engine 5 b\u01b0\u1edbc: Deep Research')],
  ['UI-3  Button pending label 5 step',   ui.includes('5 b\u01b0\u1edbc)')],
  ['UI-4  Fallback 5 events+step 6',      ui.includes('QA & Optimize') && ui.includes('setCurrentStep(6)')],
  ['UI-5  Both buttons cast 1|2|3|4|5',   (ui.match(/as 1 \| 2 \| 3 \| 4 \| 5/g) || []).length >= 2],
  ['UI-6  Button label accurate',         ui.includes('\u26a1 Th\u1ef1c thi b\u01b0\u1edbc')],
  ['UI-7  qaGateFailed in type',          ui.includes('qaGateFailed?: boolean')],
  ['UI-8  QA Gate red banner exists',     ui.includes('QA Gate:')],
  ['UI-9  qaGateWarning in type',         ui.includes('qaGateWarning?: boolean')],
  // Route checks
  ['RT-1  qa_failed gate logic',          route.includes('saveStatus = "qa_failed"')],
  ['RT-2  qa_warning gate logic',         route.includes('saveStatus = "qa_warning"')],
  ['RT-3  qaGateReason emitted',          route.includes('qaGateReason,')],
  ['RT-4  status uses saveStatus x2',     (route.match(/status: saveStatus/g) || []).length === 2],
];

let allPass = true;
for (const [name, result] of checks) {
  const icon = result ? 'PASS' : 'FAIL';
  if (!result) allPass = false;
  console.log(`[${icon}] ${name}`);
}
console.log('\n' + (allPass ? 'ALL CHECKS PASSED' : 'SOME CHECKS FAILED'));
