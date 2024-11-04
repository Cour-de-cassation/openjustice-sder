const { readFile, writeFile, readdir } = require('fs/promises');
const { resolve } = require('path');

if (!process.env.DB_TABLE_JURICA || !process.env.DB_TABLE) require('dotenv').config({ path: resolve(__dirname, '..', '.env') });

async function replaceEnv(filePath) {
  const file = await readFile(filePath, 'utf8');
  const content = file.replace(/\$\{[^}]+\}/g, (pattern) => {
    return process.env[pattern.match(/[^${}]+/)[0]];
  });
  return writeFile(resolve(__dirname, filePath.replace('_template', '')), content, 'utf8');
}

async function main() {
  try {
    const migrationsfilenames = await readdir(resolve(__dirname, 'migrations'));
    const migrationsTemplates = migrationsfilenames
      .filter((_) => _.endsWith('_template.sql'))
      .map((_) => resolve(__dirname, 'migrations', _));
    const oracleInitTemplate = resolve(__dirname, 'oracle_init_template.sql');
    const templates = [oracleInitTemplate, ...migrationsTemplates]

    Promise.all(templates.map((_) => replaceEnv(_)));
  } catch (_) {
    console.error(_);
  }
}

main();
