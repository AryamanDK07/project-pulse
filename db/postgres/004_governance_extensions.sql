-- =====================================================================
-- Project Pulse :: migration 004 — governance extensions
--
-- This file is a *schema evolution* migration. It deliberately uses
-- ALTER and DROP on objects created by schema.sql / pgvector.sql /
-- advanced.sql, so the DDL lifecycle (CREATE -> ALTER -> DROP) is shown
-- on a real, running schema rather than in isolation.
--
--   ALTER TABLE ... ADD COLUMN / ADD CONSTRAINT / DROP CONSTRAINT
--   DROP INDEX   (obsolete single-column index replaced by a composite one)
--   DROP VIEW    (dashboard view rebuilt with new columns)
--   DROP FUNCTION(signature changes: contribution + similarity functions)
--
-- New objects: reviewer role, proposal fields, full-text search column,
-- git_activities, peer_evaluations, course_required_documents, risk_events,
-- 4 reporting views, 2 calculation functions, 5 new triggers.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. ALTER: new role (Reviewer) — replace the CHECK constraint
-- ---------------------------------------------------------------------
ALTER TABLE roles DROP CONSTRAINT roles_role_name_check;
ALTER TABLE roles ADD CONSTRAINT roles_role_name_check
  CHECK (role_name IN ('student','faculty','reviewer','coordinator','admin'));

-- ---------------------------------------------------------------------
-- 2. ALTER: full proposal fields + "revision requested" workflow state
-- ---------------------------------------------------------------------
ALTER TABLE projects
  ADD COLUMN problem_statement TEXT,
  ADD COLUMN objectives        TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN scope             TEXT,
  ADD COLUMN domain            TEXT,
  ADD COLUMN technologies      TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN repository_url    TEXT
             CONSTRAINT projects_repository_url_check
             CHECK (repository_url IS NULL OR repository_url ~* '^https?://[^\s]+$');

ALTER TABLE projects DROP CONSTRAINT projects_status_check;
ALTER TABLE projects ADD CONSTRAINT projects_status_check
  CHECK (status IN ('proposed','revision_requested','approved','in_progress','completed','rejected'));

-- Full-text search (generated tsvector, weighted: title > abstract > problem statement)
ALTER TABLE projects ADD COLUMN search_tsv tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(abstract, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(problem_statement, '')), 'C')
  ) STORED;
CREATE INDEX idx_projects_search_tsv ON projects USING gin (search_tsv);

-- ---------------------------------------------------------------------
-- 3. ALTER: team responsibilities, guide vs reviewer allocations
-- ---------------------------------------------------------------------
ALTER TABLE team_members ADD COLUMN responsibility TEXT;

ALTER TABLE guide_allocations
  ADD COLUMN allocation_role TEXT NOT NULL DEFAULT 'guide'
  CONSTRAINT guide_allocations_role_check CHECK (allocation_role IN ('guide','reviewer'));

-- DROP the old "one active allocation per project" index: a project now has
-- one active GUIDE and one active REVIEWER.
DROP INDEX uq_guide_allocations_active;
CREATE UNIQUE INDEX uq_guide_allocations_active_role
  ON guide_allocations(project_id, allocation_role) WHERE is_active;

-- ---------------------------------------------------------------------
-- 4. ALTER: evidence requirements on milestones, document types on deliverables
-- ---------------------------------------------------------------------
ALTER TABLE milestones ADD COLUMN required_evidence_type TEXT
  CONSTRAINT milestones_required_evidence_type_check
  CHECK (required_evidence_type IN ('proposal','srs','design','source_code','report','presentation','other'));

ALTER TABLE deliverables ADD COLUMN document_type TEXT NOT NULL DEFAULT 'other'
  CONSTRAINT deliverables_document_type_check
  CHECK (document_type IN ('proposal','srs','design','source_code','report','presentation','other'));
CREATE INDEX idx_deliverables_type ON deliverables(document_type);

-- Mandatory document types per course (drives "missing deliverables" reports)
CREATE TABLE course_required_documents (
  course_id     BIGINT NOT NULL REFERENCES courses(course_id) ON DELETE CASCADE,
  document_type TEXT   NOT NULL
                CHECK (document_type IN ('proposal','srs','design','source_code','report','presentation','other')),
  PRIMARY KEY (course_id, document_type)
);

-- ---------------------------------------------------------------------
-- 5. ALTER: tasks, reviews, feedback, embeddings
-- ---------------------------------------------------------------------
ALTER TABLE tasks ADD COLUMN created_by BIGINT REFERENCES users(user_id) ON DELETE SET NULL;

-- DROP an obsolete index: the composite (milestone_id, status) index serves
-- every query the single-column one did, plus the task-board status filter.
DROP INDEX idx_tasks_milestone;
CREATE INDEX idx_tasks_milestone_status ON tasks(milestone_id, status);
CREATE INDEX idx_task_assignments_user_task ON task_assignments(user_id, task_id);

-- Reviewers record rubric results without changing milestone status.
ALTER TABLE reviews ADD COLUMN rubric JSONB;
ALTER TABLE reviews DROP CONSTRAINT reviews_decision_check;
ALTER TABLE reviews ADD CONSTRAINT reviews_decision_check
  CHECK (decision IN ('approved','changes_requested','commented'));

-- Feedback items can be assigned to a specific student.
ALTER TABLE feedback_items ADD COLUMN assigned_to BIGINT REFERENCES users(user_id) ON DELETE SET NULL;
CREATE INDEX idx_feedback_assigned ON feedback_items(assigned_to) WHERE assigned_to IS NOT NULL;

-- Keep the text that was embedded, so faculty can see WHAT matched.
ALTER TABLE project_embeddings ADD COLUMN source_text TEXT;

-- ---------------------------------------------------------------------
-- 6. New tables: Git evidence, peer evaluation, risk events
-- ---------------------------------------------------------------------
CREATE TABLE git_activities (
  activity_id  BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  project_id   BIGINT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
  user_id      BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  task_id      BIGINT REFERENCES tasks(task_id) ON DELETE SET NULL,
  commit_sha   TEXT NOT NULL CHECK (commit_sha ~ '^[0-9a-f]{7,40}$'),
  commit_url   TEXT CHECK (commit_url IS NULL OR commit_url ~* '^https?://[^\s]+$'),
  message      TEXT NOT NULL CHECK (char_length(message) BETWEEN 3 AND 500),
  committed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  recorded_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, commit_sha),
  CHECK (committed_at <= recorded_at + INTERVAL '1 day')
);
CREATE INDEX idx_git_project_user ON git_activities(project_id, user_id);

CREATE TABLE peer_evaluations (
  evaluation_id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  project_id    BIGINT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
  evaluator_id  BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  evaluatee_id  BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  rating        SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comments      TEXT CHECK (comments IS NULL OR char_length(comments) <= 1000),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (evaluator_id <> evaluatee_id),
  UNIQUE (project_id, evaluator_id, evaluatee_id)
);
CREATE INDEX idx_peer_evaluatee ON peer_evaluations(project_id, evaluatee_id);

CREATE TABLE risk_events (
  event_id     BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  project_id   BIGINT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
  milestone_id BIGINT REFERENCES milestones(milestone_id) ON DELETE CASCADE,
  event_type   TEXT NOT NULL CHECK (event_type IN ('milestone_overdue','risk_escalated')),
  details      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at  TIMESTAMPTZ,
  CHECK (resolved_at IS NULL OR resolved_at >= created_at)
);
-- At most one OPEN overdue event per milestone.
CREATE UNIQUE INDEX uq_risk_events_open
  ON risk_events(milestone_id, event_type) WHERE resolved_at IS NULL;
CREATE INDEX idx_risk_events_project ON risk_events(project_id, created_at DESC);

-- ---------------------------------------------------------------------
-- 7. Validation trigger: people referenced must belong to the project team
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_is_team_member(p_project_id BIGINT, p_user_id BIGINT)
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM projects p JOIN team_members tm ON tm.team_id = p.team_id
                  WHERE p.project_id = p_project_id AND tm.user_id = p_user_id);
$$;

CREATE OR REPLACE FUNCTION fn_validate_team_membership()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'peer_evaluations' THEN
    IF NOT fn_is_team_member(NEW.project_id, NEW.evaluator_id)
       OR NOT fn_is_team_member(NEW.project_id, NEW.evaluatee_id) THEN
      RAISE EXCEPTION 'Peer evaluations are only allowed between members of the same project team'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF TG_TABLE_NAME = 'git_activities' THEN
    IF NOT fn_is_team_member(NEW.project_id, NEW.user_id) THEN
      RAISE EXCEPTION 'Git activity can only be recorded for a member of the project team'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF TG_TABLE_NAME = 'feedback_items' THEN
    IF NEW.assigned_to IS NOT NULL AND NOT fn_is_team_member(NEW.project_id, NEW.assigned_to) THEN
      RAISE EXCEPTION 'Feedback can only be assigned to a member of the project team'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_peer_evaluations_validate BEFORE INSERT OR UPDATE ON peer_evaluations
  FOR EACH ROW EXECUTE FUNCTION fn_validate_team_membership();
CREATE TRIGGER trg_git_activities_validate BEFORE INSERT OR UPDATE ON git_activities
  FOR EACH ROW EXECUTE FUNCTION fn_validate_team_membership();
CREATE TRIGGER trg_feedback_assignee_validate BEFORE INSERT OR UPDATE OF assigned_to ON feedback_items
  FOR EACH ROW EXECUTE FUNCTION fn_validate_team_membership();

-- ---------------------------------------------------------------------
-- 8. Audit triggers: deletions, similarity decisions, immutable log
-- ---------------------------------------------------------------------
-- TG_ARGV = primary-key column(s); composite keys are joined with ':'.
CREATE OR REPLACE FUNCTION fn_audit_delete()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_user BIGINT := NULLIF(current_setting('app.current_user_id', true), '')::BIGINT;
  v_id   TEXT;
BEGIN
  SELECT string_agg(to_jsonb(OLD) ->> a, ':') INTO v_id FROM unnest(TG_ARGV) AS a;
  INSERT INTO audit_logs (table_name, record_id, action, old_data, changed_by)
  VALUES (TG_TABLE_NAME, v_id, 'DELETE', to_jsonb(OLD), v_user);
  RETURN OLD;
END $$;

CREATE TRIGGER trg_tasks_delete_audit AFTER DELETE ON tasks
  FOR EACH ROW EXECUTE FUNCTION fn_audit_delete('task_id');
CREATE TRIGGER trg_task_assignments_delete_audit AFTER DELETE ON task_assignments
  FOR EACH ROW EXECUTE FUNCTION fn_audit_delete('task_id', 'user_id');
CREATE TRIGGER trg_team_members_delete_audit AFTER DELETE ON team_members
  FOR EACH ROW EXECUTE FUNCTION fn_audit_delete('team_id', 'user_id');
CREATE TRIGGER trg_git_activities_delete_audit AFTER DELETE ON git_activities
  FOR EACH ROW EXECUTE FUNCTION fn_audit_delete('activity_id');

CREATE OR REPLACE FUNCTION fn_audit_similarity_decision()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.decision IS DISTINCT FROM OLD.decision THEN
    INSERT INTO audit_logs (table_name, record_id, action, old_data, new_data, changed_by)
    VALUES ('similarity_reviews', NEW.similarity_id::text, 'SIMILARITY_DECISION',
            jsonb_build_object('decision', OLD.decision),
            jsonb_build_object('decision', NEW.decision, 'score', NEW.similarity_score,
                               'matched_project_id', NEW.matched_project_id, 'notes', NEW.notes),
            NULLIF(current_setting('app.current_user_id', true), '')::BIGINT);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_similarity_decision_audit AFTER UPDATE OF decision ON similarity_reviews
  FOR EACH ROW EXECUTE FUNCTION fn_audit_similarity_decision();

-- Approval history must be immutable: audit rows can be inserted, never changed.
CREATE OR REPLACE FUNCTION fn_block_audit_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only (% blocked)', TG_OP USING ERRCODE = 'insufficient_privilege';
END $$;
-- Statement-level, so it fires even when no row matches, and also covers TRUNCATE.
CREATE TRIGGER trg_audit_logs_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON audit_logs
  FOR EACH STATEMENT EXECUTE FUNCTION fn_block_audit_mutation();

-- ---------------------------------------------------------------------
-- 9. Risk events: trigger on milestones + set-based sweep for time passing
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_milestone_overdue_event()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.due_date < CURRENT_DATE AND NEW.status IN ('pending','changes_requested') THEN
    INSERT INTO risk_events (project_id, milestone_id, event_type, details)
    VALUES (NEW.project_id, NEW.milestone_id, 'milestone_overdue',
            jsonb_build_object('title', NEW.title, 'due_date', NEW.due_date,
                               'days_late', CURRENT_DATE - NEW.due_date))
    ON CONFLICT (milestone_id, event_type) WHERE resolved_at IS NULL DO NOTHING;
  ELSE
    UPDATE risk_events SET resolved_at = now()
     WHERE milestone_id = NEW.milestone_id AND event_type = 'milestone_overdue' AND resolved_at IS NULL;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_milestones_overdue_event
  AFTER INSERT OR UPDATE OF due_date, status ON milestones
  FOR EACH ROW EXECUTE FUNCTION fn_milestone_overdue_event();

-- Milestones become overdue by the calendar, not by an UPDATE, so the
-- refresh procedure also sweeps for them. Returns the number of new events.
CREATE OR REPLACE FUNCTION fn_flag_overdue_milestones()
RETURNS INT LANGUAGE plpgsql AS $$
DECLARE v_count INT;
BEGIN
  INSERT INTO risk_events (project_id, milestone_id, event_type, details)
  SELECT m.project_id, m.milestone_id, 'milestone_overdue',
         jsonb_build_object('title', m.title, 'due_date', m.due_date, 'days_late', CURRENT_DATE - m.due_date)
    FROM milestones m
   WHERE m.due_date < CURRENT_DATE AND m.status IN ('pending','changes_requested')
  ON CONFLICT (milestone_id, event_type) WHERE resolved_at IS NULL DO NOTHING;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;

-- Escalation event when a project's risk level rises to high/critical.
CREATE OR REPLACE FUNCTION fn_risk_escalation_event()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_prev TEXT;
BEGIN
  SELECT r.risk_level INTO v_prev FROM risk_assessments r
   WHERE r.project_id = NEW.project_id AND r.risk_id <> NEW.risk_id
   ORDER BY r.assessed_at DESC, r.risk_id DESC LIMIT 1;
  IF NEW.risk_level IN ('high','critical')
     AND (v_prev IS NULL OR v_prev NOT IN ('high','critical') OR (v_prev = 'high' AND NEW.risk_level = 'critical')) THEN
    INSERT INTO risk_events (project_id, event_type, details)
    VALUES (NEW.project_id, 'risk_escalated',
            jsonb_build_object('from', coalesce(v_prev, 'unassessed'), 'to', NEW.risk_level, 'score', NEW.risk_score));
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_risk_escalation_event AFTER INSERT ON risk_assessments
  FOR EACH ROW EXECUTE FUNCTION fn_risk_escalation_event();

-- ---------------------------------------------------------------------
-- 10. Calculation functions
-- ---------------------------------------------------------------------
-- Weighted milestone completion (approved weight / total weight).
CREATE OR REPLACE FUNCTION fn_milestone_completion_pct(p_project_id BIGINT)
RETURNS NUMERIC LANGUAGE sql STABLE AS $$
  SELECT COALESCE(ROUND(100 * SUM(weight) FILTER (WHERE status = 'approved') / NULLIF(SUM(weight), 0), 1), 0)
    FROM milestones WHERE project_id = p_project_id;
$$;

-- % of the course's mandatory document types that have at least one submitted version.
CREATE OR REPLACE FUNCTION fn_documentation_completeness(p_project_id BIGINT)
RETURNS NUMERIC LANGUAGE sql STABLE AS $$
  SELECT COALESCE(ROUND(100.0 *
           COUNT(*) FILTER (WHERE EXISTS (
             SELECT 1 FROM deliverables d
               JOIN milestones m ON m.milestone_id = d.milestone_id
              WHERE m.project_id = p.project_id AND d.document_type = crd.document_type
                AND d.current_version_no > 0))
           / NULLIF(COUNT(*), 0), 1), 100)
    FROM projects p
    JOIN course_required_documents crd ON crd.course_id = p.course_id
   WHERE p.project_id = p_project_id;
$$;

-- Contribution indicator now draws on every evidence source in the proposal:
-- verified tasks, hours, manual evidence, Git commits, document uploads,
-- verified feedback resolutions, and (reported separately) peer ratings.
-- Return type changes, so the old function must be DROPped first.
DROP FUNCTION fn_student_contribution_scores(BIGINT);
CREATE FUNCTION fn_student_contribution_scores(p_project_id BIGINT)
RETURNS TABLE (user_id BIGINT, full_name TEXT, tasks_completed INT, hours_logged NUMERIC,
               evidence_points NUMERIC, commits INT, documents_uploaded INT, feedback_resolved INT,
               avg_peer_rating NUMERIC, raw_score NUMERIC, contribution_pct NUMERIC)
LANGUAGE sql STABLE AS $$
  WITH members AS (
    SELECT tm.user_id FROM team_members tm
    JOIN projects p ON p.team_id = tm.team_id WHERE p.project_id = p_project_id
  ),
  task_stats AS (
    SELECT ta.user_id,
           COUNT(*) FILTER (WHERE t.status = 'done') AS done,
           COALESCE(SUM(ta.hours_logged), 0)         AS hours
      FROM task_assignments ta
      JOIN tasks t      ON t.task_id = ta.task_id
      JOIN milestones m ON m.milestone_id = t.milestone_id
     WHERE m.project_id = p_project_id
     GROUP BY ta.user_id
  ),
  ev AS (SELECT ce.user_id, SUM(ce.weight) AS pts FROM contribution_evidence ce
          WHERE ce.project_id = p_project_id GROUP BY ce.user_id),
  git AS (SELECT g.user_id, COUNT(*) AS n FROM git_activities g
           WHERE g.project_id = p_project_id GROUP BY g.user_id),
  docs AS (SELECT dv.uploaded_by AS user_id, COUNT(*) AS n
             FROM document_versions dv
             JOIN deliverables d ON d.deliverable_id = dv.deliverable_id
             JOIN milestones m   ON m.milestone_id  = d.milestone_id
            WHERE m.project_id = p_project_id GROUP BY dv.uploaded_by),
  fb AS (SELECT f.resolved_by AS user_id, COUNT(*) AS n FROM feedback_items f
          WHERE f.project_id = p_project_id AND f.status = 'verified' GROUP BY f.resolved_by),
  peer AS (SELECT pe.evaluatee_id AS user_id, ROUND(AVG(pe.rating), 2) AS avg_rating
             FROM peer_evaluations pe WHERE pe.project_id = p_project_id GROUP BY pe.evaluatee_id),
  scored AS (
    SELECT u.user_id, u.full_name,
           COALESCE(ts.done, 0)::int  AS tasks_completed,
           COALESCE(ts.hours, 0)      AS hours_logged,
           COALESCE(ev.pts, 0)        AS evidence_points,
           COALESCE(git.n, 0)::int    AS commits,
           COALESCE(docs.n, 0)::int   AS documents_uploaded,
           COALESCE(fb.n, 0)::int     AS feedback_resolved,
           peer.avg_rating            AS avg_peer_rating,
           ROUND(3 * COALESCE(ts.done, 0) + 0.5 * COALESCE(ts.hours, 0) + COALESCE(ev.pts, 0)
                 + 1 * COALESCE(git.n, 0) + 2 * COALESCE(docs.n, 0) + 2 * COALESCE(fb.n, 0), 2) AS raw_score
      FROM members mb
      JOIN users u ON u.user_id = mb.user_id
      LEFT JOIN task_stats ts ON ts.user_id = mb.user_id
      LEFT JOIN ev   ON ev.user_id   = mb.user_id
      LEFT JOIN git  ON git.user_id  = mb.user_id
      LEFT JOIN docs ON docs.user_id = mb.user_id
      LEFT JOIN fb   ON fb.user_id   = mb.user_id
      LEFT JOIN peer ON peer.user_id = mb.user_id
  )
  SELECT s.user_id, s.full_name, s.tasks_completed, s.hours_logged, s.evidence_points, s.commits,
         s.documents_uploaded, s.feedback_resolved, s.avg_peer_rating, s.raw_score,
         ROUND(100 * s.raw_score / NULLIF(SUM(s.raw_score) OVER (), 0), 1)
    FROM scored s
   ORDER BY s.raw_score DESC;
$$;

-- Risk now also scores contribution imbalance and missing evidence.
--   milestones <= 40, tasks <= 25, feedback <= 20, silence <= 15,
--   imbalance  <= 10 (share spread above 30 points between members),
--   evidence   <= 10 (2 per completed task with no evidence / commit linked)
-- Total is capped at 100. Same return type, so CREATE OR REPLACE is enough.
CREATE OR REPLACE FUNCTION fn_calculate_project_risk(p_project_id BIGINT)
RETURNS TABLE (risk_score NUMERIC, risk_level TEXT, factors JSONB)
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_overdue_ms INT; v_avg_late NUMERIC; v_total_tasks INT; v_overdue_tsk INT; v_blocked INT;
  v_open_crit INT; v_days_silent INT; v_spread NUMERIC; v_members INT; v_unverified INT;
  v_ms_pts NUMERIC; v_task_pts NUMERIC; v_fb_pts NUMERIC; v_sil_pts NUMERIC;
  v_imb_pts NUMERIC; v_ev_pts NUMERIC; v_score NUMERIC;
BEGIN
  SELECT COUNT(*) FILTER (WHERE m.due_date < CURRENT_DATE AND m.status IN ('pending','changes_requested')),
         COALESCE(AVG(CURRENT_DATE - m.due_date)
                  FILTER (WHERE m.due_date < CURRENT_DATE AND m.status IN ('pending','changes_requested')), 0)
    INTO v_overdue_ms, v_avg_late
    FROM milestones m WHERE m.project_id = p_project_id;

  SELECT COUNT(*),
         COUNT(*) FILTER (WHERE t.due_date < CURRENT_DATE AND t.status <> 'done'),
         COUNT(*) FILTER (WHERE t.status = 'blocked'),
         COUNT(*) FILTER (WHERE t.status = 'done'
                            AND NOT EXISTS (SELECT 1 FROM contribution_evidence ce WHERE ce.task_id = t.task_id)
                            AND NOT EXISTS (SELECT 1 FROM git_activities g WHERE g.task_id = t.task_id))
    INTO v_total_tasks, v_overdue_tsk, v_blocked, v_unverified
    FROM tasks t JOIN milestones m ON m.milestone_id = t.milestone_id
   WHERE m.project_id = p_project_id;

  SELECT COUNT(*) INTO v_open_crit FROM feedback_items f
   WHERE f.project_id = p_project_id AND f.status IN ('open','in_progress') AND f.severity IN ('high','critical');

  SELECT COALESCE(
           CURRENT_DATE - (SELECT MAX(dv.uploaded_at)::date
                             FROM document_versions dv
                             JOIN deliverables d ON d.deliverable_id = dv.deliverable_id
                             JOIN milestones m   ON m.milestone_id  = d.milestone_id
                            WHERE m.project_id = p_project_id),
           GREATEST(CURRENT_DATE - (SELECT p.start_date FROM projects p WHERE p.project_id = p_project_id), 0),
           0)
    INTO v_days_silent;

  SELECT COUNT(*), COALESCE(MAX(c.contribution_pct) - MIN(c.contribution_pct), 0)
    INTO v_members, v_spread
    FROM fn_student_contribution_scores(p_project_id) c;
  IF v_members < 2 THEN v_spread := 0; END IF;

  v_ms_pts   := LEAST(40, 15 * v_overdue_ms + 0.5 * v_avg_late);
  v_task_pts := LEAST(25, COALESCE(25 * v_overdue_tsk::numeric / NULLIF(v_total_tasks, 0), 0) + 3 * v_blocked);
  v_fb_pts   := LEAST(20, 10 * v_open_crit);
  v_sil_pts  := LEAST(15, GREATEST(0, v_days_silent - 14) * 0.75);
  v_imb_pts  := ROUND(LEAST(10, GREATEST(0, v_spread - 30) / 3), 2);
  v_ev_pts   := LEAST(10, 2 * v_unverified);
  v_score    := LEAST(100, ROUND(v_ms_pts + v_task_pts + v_fb_pts + v_sil_pts + v_imb_pts + v_ev_pts, 2));

  RETURN QUERY SELECT
    v_score,
    CASE WHEN v_score >= 70 THEN 'critical' WHEN v_score >= 50 THEN 'high'
         WHEN v_score >= 25 THEN 'medium' ELSE 'low' END,
    jsonb_build_object(
      'overdue_milestones', v_overdue_ms,
      'avg_days_late', ROUND(v_avg_late, 1),
      'overdue_tasks', v_overdue_tsk,
      'blocked_tasks', v_blocked,
      'open_high_feedback', v_open_crit,
      'days_since_submission', v_days_silent,
      'contribution_spread_pct', v_spread,
      'completed_tasks_without_evidence', v_unverified,
      'points', jsonb_build_object('milestones', v_ms_pts, 'tasks', v_task_pts, 'feedback', v_fb_pts,
                                   'silence', v_sil_pts, 'imbalance', v_imb_pts, 'evidence', v_ev_pts));
END $$;

-- Refresh procedure now also sweeps for newly overdue milestones.
CREATE OR REPLACE PROCEDURE sp_refresh_risk_assessments(p_project_id BIGINT DEFAULT NULL)
LANGUAGE plpgsql AS $$
DECLARE r RECORD;
BEGIN
  PERFORM fn_flag_overdue_milestones();
  FOR r IN SELECT project_id FROM projects
            WHERE status IN ('approved','in_progress')
              AND (p_project_id IS NULL OR project_id = p_project_id)
  LOOP
    INSERT INTO risk_assessments (project_id, risk_score, risk_level, factors)
    SELECT r.project_id, c.risk_score, c.risk_level, c.factors
      FROM fn_calculate_project_risk(r.project_id) c;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- 11. pgvector: course filter + matched text. Signature changes -> DROP first.
-- ---------------------------------------------------------------------
DROP FUNCTION fn_similar_projects(vector, INT, BIGINT, NUMERIC);
CREATE FUNCTION fn_similar_projects(
  p_embedding      vector(384),
  p_limit          INT     DEFAULT 5,
  p_exclude        BIGINT  DEFAULT NULL,
  p_min_similarity NUMERIC DEFAULT 0,
  p_course_id      BIGINT  DEFAULT NULL
)
RETURNS TABLE (project_id BIGINT, title TEXT, status TEXT, course_id BIGINT,
               matched_text TEXT, similarity NUMERIC)
LANGUAGE sql STABLE AS $$
  SELECT p.project_id, p.title, p.status, p.course_id,
         left(coalesce(e.source_text, p.abstract), 400) AS matched_text,
         ROUND((1 - (e.embedding <=> p_embedding))::numeric, 4) AS similarity
  FROM   project_embeddings e
  JOIN   projects p ON p.project_id = e.project_id
  WHERE  (p_exclude IS NULL OR e.project_id <> p_exclude)
    AND  (p_course_id IS NULL OR p.course_id = p_course_id)
    AND  p.status <> 'rejected'
    AND  (1 - (e.embedding <=> p_embedding)) >= p_min_similarity
  ORDER  BY e.embedding <=> p_embedding
  LIMIT  p_limit;
$$;

-- ---------------------------------------------------------------------
-- 12. Views. The dashboard view gains columns, so DROP + CREATE.
-- ---------------------------------------------------------------------
DROP VIEW v_project_dashboard;
CREATE VIEW v_project_dashboard AS
SELECT p.project_id, p.title, p.status,
       t.team_id, t.name AS team_name,
       c.code AS course_code, d.code AS department_code, d.name AS department_name,
       ga.guide_id, g.full_name AS guide_name,
       COALESCE(ms.total, 0)    AS total_milestones,
       COALESCE(ms.approved, 0) AS approved_milestones,
       COALESCE(ms.overdue, 0)  AS overdue_milestones,
       ms.next_due,
       (ms.next_due - CURRENT_DATE) AS days_remaining,
       ROUND(100 * ms.approved_weight / NULLIF(ms.total_weight, 0), 1) AS progress_pct,
       COALESCE(tk.overdue, 0)  AS overdue_tasks,
       COALESCE(tk.blocked, 0)  AS blocked_tasks,
       COALESCE(fb.open_items, 0) AS open_feedback,
       COALESCE(md.missing, 0)  AS missing_documents,
       COALESCE(ra.risk_score, 0) AS risk_score,
       COALESCE(ra.risk_level, 'unassessed') AS risk_level,
       ra.assessed_at
FROM projects p
JOIN teams t       ON t.team_id = p.team_id
JOIN courses c     ON c.course_id = p.course_id
JOIN departments d ON d.department_id = c.department_id
LEFT JOIN guide_allocations ga ON ga.project_id = p.project_id AND ga.is_active AND ga.allocation_role = 'guide'
LEFT JOIN users g  ON g.user_id = ga.guide_id
LEFT JOIN LATERAL (
  SELECT COUNT(*) AS total,
         COUNT(*) FILTER (WHERE m.status = 'approved') AS approved,
         COUNT(*) FILTER (WHERE m.due_date < CURRENT_DATE AND m.status IN ('pending','changes_requested')) AS overdue,
         MIN(m.due_date) FILTER (WHERE m.status <> 'approved') AS next_due,
         SUM(m.weight) AS total_weight,
         SUM(m.weight) FILTER (WHERE m.status = 'approved') AS approved_weight
    FROM milestones m WHERE m.project_id = p.project_id) ms ON TRUE
LEFT JOIN LATERAL (
  SELECT COUNT(*) FILTER (WHERE k.due_date < CURRENT_DATE AND k.status <> 'done') AS overdue,
         COUNT(*) FILTER (WHERE k.status = 'blocked') AS blocked
    FROM tasks k JOIN milestones m2 ON m2.milestone_id = k.milestone_id
   WHERE m2.project_id = p.project_id) tk ON TRUE
LEFT JOIN LATERAL (
  SELECT COUNT(*) AS open_items FROM feedback_items f
   WHERE f.project_id = p.project_id AND f.status IN ('open','in_progress')) fb ON TRUE
LEFT JOIN LATERAL (
  SELECT COUNT(*) AS missing FROM course_required_documents crd
   WHERE crd.course_id = p.course_id
     AND NOT EXISTS (SELECT 1 FROM deliverables dd JOIN milestones mm ON mm.milestone_id = dd.milestone_id
                      WHERE mm.project_id = p.project_id AND dd.document_type = crd.document_type
                        AND dd.current_version_no > 0)) md ON TRUE
LEFT JOIN LATERAL (
  SELECT r.risk_score, r.risk_level, r.assessed_at FROM risk_assessments r
   WHERE r.project_id = p.project_id ORDER BY r.assessed_at DESC, r.risk_id DESC LIMIT 1) ra ON TRUE;

-- Project progress: milestones, tasks and documentation in one row.
CREATE VIEW v_project_progress AS
SELECT p.project_id, p.title, p.status,
       COUNT(DISTINCT m.milestone_id) AS total_milestones,
       COUNT(DISTINCT m.milestone_id) FILTER (WHERE m.status = 'approved') AS approved_milestones,
       fn_milestone_completion_pct(p.project_id) AS milestone_completion_pct,
       COUNT(DISTINCT k.task_id) AS total_tasks,
       COUNT(DISTINCT k.task_id) FILTER (WHERE k.status = 'done') AS done_tasks,
       ROUND(100.0 * COUNT(DISTINCT k.task_id) FILTER (WHERE k.status = 'done')
             / NULLIF(COUNT(DISTINCT k.task_id), 0), 1) AS task_completion_pct,
       fn_documentation_completeness(p.project_id) AS documentation_pct
  FROM projects p
  LEFT JOIN milestones m ON m.project_id = p.project_id
  LEFT JOIN tasks k      ON k.milestone_id = m.milestone_id
 GROUP BY p.project_id;

-- Per-member contribution for every active project (LATERAL set-returning function).
CREATE VIEW v_contribution_summary AS
SELECT p.project_id, p.title AS project_title, t.name AS team_name, c.*
  FROM projects p
  JOIN teams t ON t.team_id = p.team_id
  CROSS JOIN LATERAL fn_student_contribution_scores(p.project_id) c
 WHERE p.status IN ('approved','in_progress','completed');

-- Open feedback with age and who must resolve it.
CREATE VIEW v_unresolved_feedback AS
SELECT f.feedback_id, f.project_id, p.title AS project_title, f.milestone_id, m.title AS milestone_title,
       f.severity, f.status, f.body, a.full_name AS author_name,
       f.assigned_to, s.full_name AS assigned_to_name,
       f.created_at, (CURRENT_DATE - f.created_at::date) AS age_days
  FROM feedback_items f
  JOIN projects p ON p.project_id = f.project_id
  JOIN users a    ON a.user_id = f.author_id
  LEFT JOIN users s      ON s.user_id = f.assigned_to
  LEFT JOIN milestones m ON m.milestone_id = f.milestone_id
 WHERE f.status IN ('open','in_progress');

-- Mandatory document types each active project has not yet submitted (anti-join).
CREATE VIEW v_projects_missing_deliverables AS
SELECT p.project_id, p.title, t.name AS team_name,
       array_agg(crd.document_type ORDER BY crd.document_type) AS missing_types,
       COUNT(*) AS missing_count
  FROM projects p
  JOIN teams t ON t.team_id = p.team_id
  JOIN course_required_documents crd ON crd.course_id = p.course_id
 WHERE p.status IN ('approved','in_progress')
   AND NOT EXISTS (SELECT 1 FROM deliverables d JOIN milestones m ON m.milestone_id = d.milestone_id
                    WHERE m.project_id = p.project_id AND d.document_type = crd.document_type
                      AND d.current_version_no > 0)
 GROUP BY p.project_id, t.name
HAVING COUNT(*) > 0;

-- ---------------------------------------------------------------------
-- 13. Date validation across tables (a CHECK cannot look at another table)
--   milestone due date must lie inside the project's start/end window;
--   task due date may not be later than its milestone's due date.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_validate_due_dates()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_start DATE; v_end DATE; v_ms_due DATE;
BEGIN
  IF TG_TABLE_NAME = 'milestones' THEN
    SELECT start_date, end_date INTO v_start, v_end FROM projects WHERE project_id = NEW.project_id;
    IF v_start IS NOT NULL AND NEW.due_date < v_start THEN
      RAISE EXCEPTION 'Milestone due date % is before the project start date %', NEW.due_date, v_start
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_end IS NOT NULL AND NEW.due_date > v_end THEN
      RAISE EXCEPTION 'Milestone due date % is after the project end date %', NEW.due_date, v_end
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF TG_TABLE_NAME = 'tasks' AND NEW.due_date IS NOT NULL THEN
    SELECT due_date INTO v_ms_due FROM milestones WHERE milestone_id = NEW.milestone_id;
    IF NEW.due_date > v_ms_due THEN
      RAISE EXCEPTION 'Task due date % is after its milestone due date %', NEW.due_date, v_ms_due
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_milestones_validate_dates BEFORE INSERT OR UPDATE OF due_date ON milestones
  FOR EACH ROW EXECUTE FUNCTION fn_validate_due_dates();
CREATE TRIGGER trg_tasks_validate_dates BEFORE INSERT OR UPDATE OF due_date, milestone_id ON tasks
  FOR EACH ROW EXECUTE FUNCTION fn_validate_due_dates();
