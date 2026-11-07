import mongoose from 'mongoose';
import { connectMongo } from './mongo';
import { SrsChangeLog, SrsDocument } from '@/models/srs';

export interface SectionInput { sectionId?: string; heading: string; content: string }
interface StoredSection { sectionId: string; heading: string; content: string }
interface StoredVersion { versionNo: number; sections: StoredSection[] }

export interface AppendArgs {
  projectId: number; milestoneId: number; documentType: string; tags: string[]; deliverableId: number; title: string; versionNo: number; pgVersionId: number;
  userId: number; summary: string; checksum: string; sections: SectionInput[];
  versionObjectId: mongoose.Types.ObjectId;
}

/** Appends a version to the SRS document and writes section-level change history. */
export async function appendSrsVersion(a: AppendArgs): Promise<void> {
  await connectMongo();
  const sections = a.sections.map((s, i) => ({
    sectionId: s.sectionId ?? `S${i + 1}`, heading: s.heading, order: i + 1, content: s.content, requirements: [],
  }));
  const previous = (await SrsDocument.findOneAndUpdate(
    { deliverableId: a.deliverableId },
    {
      $setOnInsert: { projectId: a.projectId, milestoneId: a.milestoneId, documentType: a.documentType, title: a.title },
      $addToSet: { tags: { $each: a.tags } },
      $set: { currentVersion: a.versionNo },
      $push: { versions: {
        _id: a.versionObjectId, versionNo: a.versionNo, pgVersionId: a.pgVersionId, createdBy: a.userId,
        changeSummary: a.summary, checksum: a.checksum, sections, createdAt: new Date() } },
    },
    { upsert: true, new: false },
  ).lean()) as { versions?: StoredVersion[] } | null;

  const prev = previous?.versions?.at(-1);
  const before = new Map((prev?.sections ?? []).map((s) => [s.sectionId, s]));
  const after = new Map(sections.map((s) => [s.sectionId, s]));
  const events: Record<string, unknown>[] = [];
  for (const s of sections) {
    const old = before.get(s.sectionId);
    if (!old) events.push({ sectionId: s.sectionId, changeType: 'added', after: s.content });
    else if (old.content !== s.content || old.heading !== s.heading)
      events.push({ sectionId: s.sectionId, changeType: 'modified', before: old.content, after: s.content });
  }
  for (const old of before.values())
    if (!after.has(old.sectionId)) events.push({ sectionId: old.sectionId, changeType: 'removed', before: old.content });
  if (events.length)
    await SrsChangeLog.insertMany(events.map((e) => ({
      ...e, projectId: a.projectId, deliverableId: a.deliverableId,
      fromVersion: prev?.versionNo ?? 0, toVersion: a.versionNo, changedBy: a.userId })));
}

/** Compensating action (saga) if the PostgreSQL commit fails after MongoDB was written. */
export async function removeSrsVersion(deliverableId: number, versionObjectId: mongoose.Types.ObjectId, versionNo: number) {
  await connectMongo();
  await SrsDocument.updateOne({ deliverableId },
    { $pull: { versions: { _id: versionObjectId } }, $set: { currentVersion: Math.max(versionNo - 1, 0) } });
  await SrsChangeLog.deleteMany({ deliverableId, toVersion: versionNo });
}

/* ─── Aggregation pipelines (reports) ─────────────────────────────── */
export interface DocStats {
  projectId: number; documents: number; totalVersions: number; latestUpload: string | null;
  documentTypes: string[];
}
export interface ChangeStats { projectId: number; changeType: string; count: number }
export interface TypeDistribution { documentType: string; documents: number; versions: number }

/**
 * Per-project document summary: number of documents, total versions, types present,
 * latest upload and section count of the newest version — via $unwind / $group / $project.
 */
export async function documentStats(projectIds: number[]): Promise<{
  perProject: DocStats[]; changes: ChangeStats[]; byType: TypeDistribution[];
}> {
  await connectMongo();
  const match = { $match: { projectId: { $in: projectIds } } };
  const [perProject, changes, byType] = await Promise.all([
    SrsDocument.aggregate([
      match,
      { $unwind: '$versions' },
      // one row per document (deliverable): its version count and newest upload
      { $group: {
          _id: { deliverableId: '$deliverableId', projectId: '$projectId', documentType: '$documentType' },
          versions: { $sum: 1 },
          latestUpload: { $max: '$versions.createdAt' } } },
      // one row per project
      { $group: {
          _id: '$_id.projectId',
          documents: { $sum: 1 },
          totalVersions: { $sum: '$versions' },
          latestUpload: { $max: '$latestUpload' },
          documentTypes: { $addToSet: '$_id.documentType' } } },
      { $project: { _id: 0, projectId: '$_id', documents: 1, totalVersions: 1, latestUpload: 1, documentTypes: 1 } },
      { $sort: { projectId: 1 } },
    ]),
    SrsChangeLog.aggregate([
      match,
      { $group: { _id: { projectId: '$projectId', changeType: '$changeType' }, count: { $sum: 1 } } },
      { $project: { _id: 0, projectId: '$_id.projectId', changeType: '$_id.changeType', count: 1 } },
      { $sort: { projectId: 1, changeType: 1 } },
    ]),
    SrsDocument.aggregate([
      match,
      { $unwind: '$versions' },
      { $group: { _id: { t: '$documentType', d: '$deliverableId' }, versions: { $sum: 1 } } },
      { $group: { _id: '$_id.t', documents: { $sum: 1 }, versions: { $sum: '$versions' } } },
      { $project: { _id: 0, documentType: '$_id', documents: 1, versions: 1 } },
      { $sort: { documents: -1, documentType: 1 } },
    ]),
  ]);
  return { perProject, changes, byType } as unknown as {
    perProject: DocStats[]; changes: ChangeStats[]; byType: TypeDistribution[];
  };
}

/** Full-text search across SRS section headings and content ($text index). */
export async function searchDocuments(projectIds: number[], q: string) {
  await connectMongo();
  return SrsDocument.aggregate([
    { $match: { $text: { $search: q }, projectId: { $in: projectIds } } },
    { $project: { _id: 0, projectId: 1, deliverableId: 1, documentType: 1, title: 1,
                  score: { $meta: 'textScore' } } },
    { $sort: { score: -1 } },
    { $limit: 20 },
  ]);
}
