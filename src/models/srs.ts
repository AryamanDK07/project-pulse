// MongoDB document model for SRS artefacts: versions -> sections -> requirements,
// plus an append-only change log. PostgreSQL stores only pointers (deliverable_id,
// document_versions.mongo_version_id); long, nested, evolving text lives here.
import mongoose, { Schema } from 'mongoose';

const RequirementSchema = new Schema({
  reqId: { type: String, required: true },
  type: { type: String, enum: ['functional', 'non_functional', 'constraint'], default: 'functional' },
  text: { type: String, required: true },
  priority: { type: String, enum: ['must', 'should', 'could'], default: 'should' },
}, { _id: false });

const SectionSchema = new Schema({
  sectionId: { type: String, required: true },
  heading: { type: String, required: true },
  order: { type: Number, required: true },
  content: { type: String, default: '' },
  requirements: { type: [RequirementSchema], default: [] },
}, { _id: false });

const VersionSchema = new Schema({
  versionNo: { type: Number, required: true, min: 1 },
  pgVersionId: { type: Number },            // document_versions.version_id
  createdBy: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now },
  changeSummary: { type: String },
  checksum: { type: String },
  sections: { type: [SectionSchema], default: [] },
});                                           // keeps its own _id (referenced from PostgreSQL)

const SrsDocumentSchema = new Schema({
  projectId: { type: Number, required: true, index: true },
  milestoneId: { type: Number },
  deliverableId: { type: Number, required: true, unique: true },
  documentType: { type: String, default: 'other' },   // srs | design | report | … (mirrors deliverables.document_type)
  title: { type: String },
  tags: { type: [String], default: [] },
  currentVersion: { type: Number, default: 0 },
  versions: { type: [VersionSchema], default: [] },
}, { timestamps: true, collection: 'srs_documents' });
SrsDocumentSchema.index({ projectId: 1, milestoneId: 1 });
SrsDocumentSchema.index({ documentType: 1 });
SrsDocumentSchema.index({ tags: 1 });
SrsDocumentSchema.index({ 'versions.createdAt': -1 });
SrsDocumentSchema.index({ 'versions.sections.heading': 'text', 'versions.sections.content': 'text' });

const SrsChangeLogSchema = new Schema({
  projectId: { type: Number, required: true },
  deliverableId: { type: Number, required: true },
  fromVersion: { type: Number, required: true },
  toVersion: { type: Number, required: true },
  sectionId: { type: String, required: true },
  changeType: { type: String, enum: ['added', 'modified', 'removed'], required: true },
  before: { type: String },
  after: { type: String },
  changedBy: { type: Number, required: true },
  changedAt: { type: Date, default: Date.now },
}, { collection: 'srs_change_log' });
SrsChangeLogSchema.index({ deliverableId: 1, toVersion: -1 });

export const SrsDocument = mongoose.models.SrsDocument ?? mongoose.model('SrsDocument', SrsDocumentSchema);
export const SrsChangeLog = mongoose.models.SrsChangeLog ?? mongoose.model('SrsChangeLog', SrsChangeLogSchema);
