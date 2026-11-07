import mongoose from 'mongoose';
import { connectMongo } from './mongo';
import { SrsChangeLog, SrsDocument } from '@/models/srs';

export interface SectionInput { sectionId?: string; heading: string; content: string }
interface StoredSection { sectionId: string; heading: string; content: string }
interface StoredVersion { versionNo: number; sections: StoredSection[] }

export interface AppendArgs {
  projectId: number; deliverableId: number; title: string; versionNo: number; pgVersionId: number;
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
      $setOnInsert: { projectId: a.projectId, title: a.title },
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
