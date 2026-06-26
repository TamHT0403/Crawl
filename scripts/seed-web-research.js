const { PrismaClient } = require('@prisma/client');
const { createCipheriv, randomBytes } = require('crypto');
const fs = require('fs');
const path = require('path');

// Read encryption key from .env
const envPath = path.join(__dirname, '.env');
const envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf-8') : '';
const encKey = envContent.match(/ENCRYPTION_KEY=([^\r\n]+)/)?.[1];

const prisma = new PrismaClient();

// AES-256-GCM encrypt matching app's crypto.ts
function encrypt(text, keyHex) {
  const key = Buffer.from(keyHex, 'hex');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

const TAVILY_KEY = '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';

const plainConfigs = [
  { key: 'config_web_search_provider', value: 'tavily' },
  { key: 'config_web_search_max_results', value: '5' },
  { key: 'config_content_gen_niche', value: 'tài chính' },
  { key: 'config_content_gen_token_budget', value: '20000' },
  { key: 'config_web_search_token_budget', value: '2000' },
];

async function seed() {
  // Upsert plain configs
  for (const cfg of plainConfigs) {
    await prisma.setting.upsert({
      where: { key: cfg.key },
      create: { key: cfg.key, value: cfg.value },
      update: { value: cfg.value },
    });
    console.log('Seeded:', cfg.key, '=', cfg.value);
  }

  // Upsert API key (encrypt if key available)
  let apiKeyValue = TAVILY_KEY;
  if (encKey && encKey.length === 64) {
    try {
      apiKeyValue = encrypt(TAVILY_KEY, encKey);
      console.log('Tavily API key encrypted successfully');
    } catch (e) {
      console.log('Encryption failed, storing plaintext:', e.message);
    }
  } else {
    console.log('No ENCRYPTION_KEY in .env, storing API key as plaintext');
  }

  await prisma.setting.upsert({
    where: { key: 'config_web_search_api_key' },
    create: { key: 'config_web_search_api_key', value: apiKeyValue },
    update: { value: apiKeyValue },
  });
  console.log('Seeded: config_web_search_api_key');
  console.log('\nDone! Web research config seeded to DB.');
}

seed()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
