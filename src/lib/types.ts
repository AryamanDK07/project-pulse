export interface SessionUser { userId: number; name: string; roles: string[]; role: string }

export interface MilestoneRow {
  milestone_id: number; project_id: number; project_title: string; title: string; description: string | null;
  sequence_no: number; due_date: string; status: string; weight: string; submitted_at: string | null;
  is_overdue: boolean; latest_version_no: number | null; latest_file_name: string | null; open_feedback: number;
}
export interface FeedbackRow {
  feedback_id: number; project_id: number; project_title: string; milestone_id: number | null;
  milestone_title: string | null; body: string; severity: string; status: string;
  resolution_note: string | null; created_at: string; author_name: string;
}
export interface RiskRow {
  project_id: number; title: string; status: string; team_name: string; course_code: string;
  department_code: string; guide_name: string | null; total_milestones: string; approved_milestones: string;
  overdue_milestones: string; open_feedback: string; next_due: string | null; progress_pct: string | null;
  risk_score: string; risk_level: string;
}
export interface SimilarityReview {
  similarity_id: number; matched_project_id: number; matched_title: string; similarity_score: string; decision: string;
}
export interface ProposalRow {
  project_id: number; title: string; abstract: string; status: string; team_name: string; course_code: string;
  guide_name: string | null; similarity_reviews: SimilarityReview[];
}
