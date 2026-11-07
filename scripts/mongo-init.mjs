// Usage: npm run mongo:init            (no mongosh needed)
//        npm run mongo:init -- --reset (drop the SRS collections first — used by `npm run setup`)
// 1. Creates srs_documents / srs_change_log with $jsonSchema validators.
// 2. Creates the indexes the app and reports rely on.
// 3. Seeds an SRS document for every seeded PostgreSQL deliverable that has none yet,
//    and writes the Mongo version id back into document_versions.mongo_version_id.
import mongoose from 'mongoose';
import pg from 'pg';

const { MONGODB_URI, DATABASE_URL } = process.env;
if (!MONGODB_URI || !DATABASE_URL) { console.error('MONGODB_URI and DATABASE_URL must be set (.env.local)'); process.exit(1); }

const num = { bsonType: ['int', 'long', 'double'] };
const requirement = { bsonType: 'object', required: ['reqId', 'text'], properties: {
  reqId: { bsonType: 'string' }, type: { enum: ['functional', 'non_functional', 'constraint'] },
  text: { bsonType: 'string' }, priority: { enum: ['must', 'should', 'could'] } } };
const section = { bsonType: 'object', required: ['sectionId', 'heading', 'order'], properties: {
  sectionId: { bsonType: 'string' }, heading: { bsonType: 'string' }, order: num,
  content: { bsonType: 'string' }, requirements: { bsonType: 'array', items: requirement } } };
const version = { bsonType: 'object', required: ['_id', 'versionNo', 'createdBy', 'sections'], properties: {
  versionNo: { ...num, minimum: 1 }, pgVersionId: num, createdBy: num,
  changeSummary: { bsonType: 'string' }, checksum: { bsonType: 'string' },
  sections: { bsonType: 'array', items: section } } };
const validators = {
  srs_documents: { $jsonSchema: { bsonType: 'object', required: ['projectId', 'deliverableId', 'versions'], properties: {
    projectId: num, milestoneId: num, deliverableId: num, currentVersion: num,
    documentType: { enum: ['proposal', 'srs', 'design', 'source_code', 'report', 'presentation', 'other'] },
    tags: { bsonType: 'array', items: { bsonType: 'string' } },
    versions: { bsonType: 'array', items: version } } } },
  srs_change_log: { $jsonSchema: { bsonType: 'object', required: ['deliverableId', 'toVersion', 'sectionId', 'changeType'],
    properties: { changeType: { enum: ['added', 'modified', 'removed'] } } } },
};

const SAMPLE_SECTIONS = [
  { heading: 'Introduction', content: 'Purpose, intended audience and scope of the system.' },
  { heading: 'Functional Requirements', content: 'User roles, proposal workflow, milestone submission and review.' },
  { heading: 'Non-Functional Requirements', content: 'Performance, security, availability and scalability targets.' },
];

await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
const db = mongoose.connection.db;
if (process.argv.includes('--reset')) {
  for (const name of ['srs_documents', 'srs_change_log']) await db.dropCollection(name).catch(() => undefined);
  console.log('✔ dropped srs_documents, srs_change_log');
}
const existing = (await db.listCollections().toArray()).map((c) => c.name);
for (const [name, validator] of Object.entries(validators)) {
  try {
    if (existing.includes(name)) await db.command({ collMod: name, validator, validationLevel: 'moderate' });
    else await db.createCollection(name, { validator });
    console.log('✔ collection + validator', name);
  } catch (e) {
    // Some Mongo-compatible servers (e.g. FerretDB) do not support validators; the app still works.
    if (!existing.includes(name)) await db.createCollection(name).catch(() => undefined);
    console.warn(`! ${name}: validator not applied (${e.message})`);
  }
}

const docs = db.collection('srs_documents');
const log = db.collection('srs_change_log');
const indexes = [
  [docs, { deliverableId: 1 }, { unique: true }], [docs, { projectId: 1, milestoneId: 1 }], [docs, { documentType: 1 }],
  [docs, { tags: 1 }], [docs, { 'versions.createdAt': -1 }],
  [docs, { 'versions.sections.heading': 'text', 'versions.sections.content': 'text' }],
  [log, { deliverableId: 1, toVersion: -1 }], [log, { projectId: 1, changedAt: -1 }],
];
for (const [coll, keys, opts] of indexes) {
  try { await coll.createIndex(keys, opts ?? {}); }
  catch (e) { console.warn(`! index ${JSON.stringify(keys)} skipped (${e.message})`); }
}
console.log('✔ indexes');

const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();
const { rows } = await client.query(`
  SELECT d.deliverable_id, d.title, d.document_type, m.milestone_id, m.project_id, p.technologies,
         json_agg(json_build_object('version_id', dv.version_id, 'version_no', dv.version_no,
                  'uploaded_by', dv.uploaded_by, 'uploaded_at', dv.uploaded_at,
                  'change_summary', dv.change_summary, 'checksum', dv.checksum, 'file_url', dv.file_url)
                  ORDER BY dv.version_no) AS versions
    FROM deliverables d
    JOIN milestones m ON m.milestone_id = d.milestone_id
    JOIN projects p   ON p.project_id = m.project_id
    JOIN document_versions dv ON dv.deliverable_id = d.deliverable_id
   GROUP BY d.deliverable_id, m.milestone_id, m.project_id, p.technologies`);
let seeded = 0;
for (const d of rows) {
  if (await docs.findOne({ deliverableId: Number(d.deliverable_id) })) continue;
  const versions = d.versions.map((v, i) => ({
    _id: new mongoose.Types.ObjectId(), versionNo: v.version_no, pgVersionId: Number(v.version_id),
    createdBy: Number(v.uploaded_by), createdAt: new Date(v.uploaded_at), changeSummary: v.change_summary,
    checksum: v.checksum, fileUrl: v.file_url ?? undefined,
    sections: SAMPLE_SECTIONS.slice(0, 2 + Math.min(i, 1)).map((s, j) => ({
      sectionId: `S${j + 1}`, heading: s.heading, order: j + 1, content: s.content, requirements: [] })),
  }));
  await docs.insertOne({
    projectId: Number(d.project_id), milestoneId: Number(d.milestone_id), deliverableId: Number(d.deliverable_id),
    documentType: d.document_type, title: d.title, tags: d.technologies ?? [],
    currentVersion: versions.at(-1).versionNo, versions, createdAt: new Date(), updatedAt: new Date() });
  for (let i = 1; i < versions.length; i++)
    await log.insertOne({ projectId: Number(d.project_id), deliverableId: Number(d.deliverable_id),
      fromVersion: versions[i - 1].versionNo, toVersion: versions[i].versionNo, sectionId: 'S3',
      changeType: 'added', after: SAMPLE_SECTIONS[2].content, changedBy: versions[i].createdBy, changedAt: versions[i].createdAt });
  for (const v of versions)
    await client.query('UPDATE document_versions SET mongo_version_id = $1 WHERE version_id = $2', [v._id.toHexString(), v.pgVersionId]);
  seeded++;
}
console.log(`✔ seeded ${seeded} SRS document(s)`);
await client.end();
await mongoose.disconnect();
