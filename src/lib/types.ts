export interface SessionUser { userId: number; name: string; roles: string[]; role: string }

export interface MilestoneRow {
  milestone_id: number; project_id: number; project_title: string; title: string; description: string | null;
  sequence_no: number; due_date: string; status: string; weight: string; submitted_at: string | null;
  is_overdue: boolean; latest_version_no: number | null; latest_file_name: string | null; open_feedback: number;
  required_evidence_type: string | null;
}
export interface FeedbackRow {
  feedback_id: number; project_id: number; project_title: string; milestone_id: number | null;
  milestone_title: string | null; body: string; severity: string; status: string;
  resolution_note: string | null; created_at: string; author_name: string;
  assigned_to: number | null; assigned_to_name: string | null;
}
export interface RiskRow {
  project_id: number; title: string; status: string; team_name: string; course_code: string;
  department_code: string; guide_name: string | null; total_milestones: string; approved_milestones: string;
  overdue_milestones: string; open_feedback: string; next_due: string | null; progress_pct: string | null;
  risk_score: string; risk_level: string;
}
export interface SimilarityReview {
  similarity_id: number; matched_project_id: number; matched_title: string; matched_text: string | null;
  similarity_score: string; decision: string;
}
export interface ProposalRow {
  project_id: number; team_id: number; title: string; abstract: string; problem_statement: string | null;
  objectives: string[]; scope: string | null; domain: string | null; technologies: string[];
  repository_url: string | null; status: string; team_name: string; course_code: string;
  guide_name: string | null; reviewer_name: string | null; similarity_reviews: SimilarityReview[];
  latest_guide_note: string | null;
}
export interface Member { user_id: number; full_name: string; email?: string; member_role?: string; responsibility?: string | null }
export interface TeamRow {
  team_id: number; name: string; course_id: number; course_code: string; members: Member[];
  project_id: number | null; project_title: string | null; project_status: string | null;
}
export interface TaskRow {
  task_id: number; milestone_id: number; milestone_title: string; sequence_no: number; title: string;
  description: string | null; status: string; priority: string; due_date: string | null;
  estimated_hours: string | null; completed_at: string | null; is_overdue: boolean;
  assignees: { user_id: number; full_name: string; hours_logged: string }[]; hours_logged: string; linked_commits: number;
}
export interface ContributionRow {
  user_id: number; full_name: string; tasks_completed: number; hours_logged: string; evidence_points: string;
  commits: number; documents_uploaded: number; feedback_resolved: number; avg_peer_rating: string | null;
  raw_score: string; contribution_pct: string | null;
}
export interface GitRow {
  activity_id: number; user_id: number; full_name: string; task_id: number | null; task_title: string | null;
  commit_sha: string; commit_url: string | null; message: string; committed_at: string;
}
export interface PeerRow {
  evaluation_id: number; evaluator_id: number; evaluator_name: string; evaluatee_id: number;
  evaluatee_name: string; rating: number; comments: string | null; created_at: string;
}
export const EVIDENCE_TYPES = ['proposal', 'srs', 'design', 'source_code', 'report', 'presentation', 'other'] as const;
