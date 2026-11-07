// Generates docs/data-dictionary.md from the live PostgreSQL catalog, so the
// documentation always matches the real schema. Usage: npm run docs:dictionary
import fs from 'node:fs';
import pg from 'pg';

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const tables = (await c.query(`
  SELECT c.relname AS table, obj_description(c.oid) AS comment
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname <> 'schema_migrations'
   ORDER BY c.relname`)).rows;
const out = ['# Data dictionary (PostgreSQL)', '',
  'Generated from the live database catalog by `npm run docs:dictionary`.', '',
  `**${tables.length} tables.** PK = primary key, FK = foreign key, UQ = unique.`, ''];

for (const { table } of tables) {
  const cols = (await c.query(`
    SELECT a.attname AS col, format_type(a.atttypid, a.atttypmod) AS type, a.attnotnull AS notnull,
           pg_get_expr(d.adbin, d.adrelid) AS def, a.attgenerated AS gen
      FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
     WHERE a.attrelid = $1::regclass AND a.attnum > 0 AND NOT a.attisdropped ORDER BY a.attnum`, [table])).rows;
  const cons = (await c.query(`
    SELECT conname, contype, pg_get_constraintdef(oid) AS def, conkey
      FROM pg_constraint WHERE conrelid = $1::regclass ORDER BY contype, conname`, [table])).rows;
  const idx = (await c.query(`SELECT indexname, indexdef FROM pg_indexes WHERE tablename = $1 ORDER BY indexname`, [table])).rows;
  const colNo = Object.fromEntries((await c.query(
    `SELECT attnum, attname FROM pg_attribute WHERE attrelid = $1::regclass AND attnum > 0`, [table])).rows.map((r) => [r.attnum, r.attname]));
  const keyOf = (col) => cons.filter((k) => k.conkey?.map((n) => colNo[n]).includes(col))
    .map((k) => ({ p: 'PK', f: 'FK', u: 'UQ' })[k.contype]).filter(Boolean);

  out.push(`## ${table}`, '', '| Column | Type | Null | Default | Key |', '|---|---|---|---|---|');
  for (const r of cols) {
    const def = r.gen === 's' ? 'GENERATED (stored)' : (r.def ?? '').replace(/\|/g, '\\|').slice(0, 60);
    out.push(`| ${r.col} | ${r.type} | ${r.notnull ? 'NOT NULL' : 'null'} | ${def} | ${[...new Set(keyOf(r.col))].join(', ')} |`);
  }
  const rules = cons.filter((k) => k.contype !== 'n');
  if (rules.length) {
    out.push('', '**Constraints**', '');
    for (const k of rules) out.push(`- \`${k.conname}\` — ${k.def.replace(/\|/g, '\\|')}`);
  }
  const extra = idx.filter((i) => !cons.some((k) => k.conname === i.indexname));
  if (extra.length) {
    out.push('', '**Indexes**', '');
    for (const i of extra) out.push(`- \`${i.indexname}\` — ${i.indexdef.replace(/^CREATE (UNIQUE )?INDEX \S+ ON public\.\S+ /, '$1').trim()}`);
  }
  out.push('');
}

const views = (await c.query(`SELECT viewname FROM pg_views WHERE schemaname = 'public' ORDER BY viewname`)).rows;
out.push('## Views', '', ...views.map((v) => `- \`${v.viewname}\``), '');
const fns = (await c.query(`
  SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args, p.prokind
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname ~ '^(fn_|sp_)' ORDER BY p.proname`)).rows;
out.push('## Functions and procedures', '', ...fns.map((f) => `- \`${f.proname}(${f.args})\`${f.prokind === 'p' ? ' — procedure' : ''}`), '');
const trg = (await c.query(`
  SELECT t.tgname, c.relname FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
   WHERE NOT t.tgisinternal ORDER BY c.relname, t.tgname`)).rows;
out.push('## Triggers', '', '| Trigger | Table |', '|---|---|', ...trg.map((t) => `| \`${t.tgname}\` | ${t.relname} |`), '');
await c.end();
fs.mkdirSync('docs', { recursive: true });
fs.writeFileSync('docs/data-dictionary.md', out.join('\n'));
console.log(`docs/data-dictionary.md — ${tables.length} tables, ${views.length} views, ${fns.length} routines, ${trg.length} triggers`);
