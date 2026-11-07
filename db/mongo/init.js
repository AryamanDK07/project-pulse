// Run with:  mongosh "mongodb://localhost:27017/project_pulse" db/mongo/init.js
// Creates validated collections for SRS artefacts. (Mongoose also creates them lazily;
// this script adds server-side $jsonSchema validation and indexes.)
const requirement = {
  bsonType: 'object', required: ['reqId', 'text'],
  properties: {
    reqId: { bsonType: 'string' },
    type: { enum: ['functional', 'non_functional', 'constraint'] },
    text: { bsonType: 'string' },
    priority: { enum: ['must', 'should', 'could'] },
  },
};
const section = {
  bsonType: 'object', required: ['sectionId', 'heading', 'order'],
  properties: {
    sectionId: { bsonType: 'string' }, heading: { bsonType: 'string' },
    order: { bsonType: 'int' }, content: { bsonType: 'string' },
    requirements: { bsonType: 'array', items: requirement },
  },
};
const version = {
  bsonType: 'object', required: ['_id', 'versionNo', 'createdBy', 'sections'],
  properties: {
    versionNo: { bsonType: 'int', minimum: 1 },
    pgVersionId: { bsonType: ['int', 'long', 'double'] },   // pointer back to document_versions.version_id
    createdBy: { bsonType: ['int', 'long', 'double'] },
    changeSummary: { bsonType: 'string' }, checksum: { bsonType: 'string' },
    sections: { bsonType: 'array', items: section },
  },
};

function ensure(name, validator) {
  if (db.getCollectionNames().includes(name)) db.runCommand({ collMod: name, validator, validationLevel: 'moderate' });
  else db.createCollection(name, { validator });
}

ensure('srs_documents', { $jsonSchema: {
  bsonType: 'object', required: ['projectId', 'deliverableId', 'versions'],
  properties: { projectId: { bsonType: ['int', 'long', 'double'] },
                deliverableId: { bsonType: ['int', 'long', 'double'] },
                currentVersion: { bsonType: ['int', 'long', 'double'] },
                versions: { bsonType: 'array', items: version } } } });
ensure('srs_change_log', { $jsonSchema: {
  bsonType: 'object', required: ['deliverableId', 'toVersion', 'sectionId', 'changeType'],
  properties: { changeType: { enum: ['added', 'modified', 'removed'] } } } });

db.srs_documents.createIndex({ deliverableId: 1 }, { unique: true });
db.srs_documents.createIndex({ projectId: 1 });
db.srs_documents.createIndex({ 'versions.sections.heading': 'text', 'versions.sections.content': 'text' });
db.srs_change_log.createIndex({ deliverableId: 1, toVersion: -1 });
db.srs_change_log.createIndex({ projectId: 1, changedAt: -1 });
print('MongoDB collections and indexes ready.');
