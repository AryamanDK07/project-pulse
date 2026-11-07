-- =====================================================================
-- Project Pulse :: advanced PostgreSQL objects
--   (a) risk + contribution functions / procedure
--   (b) audit trigger for status changes
--   (c) faculty dashboard view
-- =====================================================================

-- ---------------------------------------------------------------------
-- (a1) Project risk calculation.
-- Weighted, capped components (max 100):
--   milestones  <= 40 : 15 per overdue milestone + 0.5 per average day late
--   tasks       <= 25 : 25 * overdue-task ratio + 3 per blocked task
--   feedback    <= 20 : 10 per open high/critical feedback item
--   silence     <= 15 : 0.75 per day beyond 14 days without any submission
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_calculate_project_risk(p_project_id BIGINT)
RETURNS TABLE (risk_score NUMERIC, risk_level TEXT, factors JSONB)
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_overdue_ms   INT;
  v_avg_late     NUMERIC;
  v_total_tasks  INT;
  v_overdue_tsk  INT;
  v_blocked      INT;
  v_open_crit    INT;
  v_days_silent  INT;
  v_ms_pts NUMERIC; v_task_pts NUMERIC; v_fb_pts NUMERIC; v_sil_pts NUMERIC;
  v_score NUMERIC;
BEGIN
  SELECT COUNT(*) FILTER (WHERE m.due_date < CURRENT_DATE AND m.status IN ('pending','changes_requested')),
         COALESCE(AVG(CURRENT_DATE - m.due_date)
                  FILTER (WHERE m.due_date < CURRENT_DATE AND m.status IN ('pending','changes_requested')), 0)
    INTO v_overdue_ms, v_avg_late
    FROM milestones m WHERE m.project_id = p_project_id;

  SELECT COUNT(*),
         COUNT(*) FILTER (WHERE t.due_date < CURRENT_DATE AND t.status <> 'done'),
         COUNT(*) FILTER (WHERE t.status = 'blocked')
    INTO v_total_tasks, v_overdue_tsk, v_blocked
    FROM tasks t JOIN milestones m ON m.milestone_id = t.milestone_id
   WHERE m.project_id = p_project_id;

  SELECT COUNT(*) INTO v_open_crit
    FROM feedback_items f
   WHERE f.project_id = p_project_id
     AND f.status IN ('open','in_progress')
     AND f.severity IN ('high','critical');

  SELECT COALESCE(
           CURRENT_DATE - (SELECT MAX(dv.uploaded_at)::date
                             FROM document_versions dv
                             JOIN deliverables d ON d.deliverable_id = dv.deliverable_id
                             JOIN milestones m   ON m.milestone_id  = d.milestone_id
                            WHERE m.project_id = p_project_id),
           GREATEST(CURRENT_DATE - (SELECT p.start_date FROM projects p WHERE p.project_id = p_project_id), 0),
           0)
    INTO v_days_silent;

  v_ms_pts   := LEAST(40, 15 * v_overdue_ms + 0.5 * v_avg_late);
  v_task_pts := LEAST(25, 25 * v_overdue_tsk::numeric / NULLIF(v_total_tasks, 0) + 3 * v_blocked);
  v_fb_pts   := LEAST(20, 10 * v_open_crit);
  v_sil_pts  := LEAST(15, GREATEST(0, v_days_silent - 14) * 0.75);
  v_score    := ROUND(COALESCE(v_ms_pts,0) + COALESCE(v_task_pts,0) + v_fb_pts + v_sil_pts, 2);
  v_score    := LEAST(100, v_score);

  RETURN QUERY SELECT
    v_score,
    CASE WHEN v_score >= 70 THEN 'critical'
         WHEN v_score >= 50 THEN 'high'
         WHEN v_score >= 25 THEN 'medium'
         ELSE 'low' END,
    jsonb_build_object(
      'overdue_milestones', v_overdue_ms,
      'avg_days_late',      ROUND(v_avg_late, 1),
      'overdue_tasks',      v_overdue_tsk,
      'blocked_tasks',      v_blocked,
      'open_high_feedback', v_open_crit,
      'days_since_submission', v_days_silent,
      'points', jsonb_build_object('milestones', v_ms_pts, 'tasks', COALESCE(v_task_pts,0),
                                   'feedback', v_fb_pts, 'silence', v_sil_pts));
END $$;

-- Snapshot risk for one project (or all active projects) into risk_assessments.
CREATE OR REPLACE PROCEDURE sp_refresh_risk_assessments(p_project_id BIGINT DEFAULT NULL)
LANGUAGE plpgsql AS $$
DECLARE r RECORD;
BEGIN
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
-- (a2) Student contribution scores.
-- raw = 3 * completed tasks + 0.5 * hours logged + sum(evidence weights)
-- contribution_pct = member share of the team's total (window function).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_student_contribution_scores(p_project_id BIGINT)
RETURNS TABLE (user_id BIGINT, full_name TEXT, tasks_completed INT, hours_logged NUMERIC,
               evidence_points NUMERIC, raw_score NUMERIC, contribution_pct NUMERIC)
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
  ev AS (
    SELECT ce.user_id, SUM(ce.weight) AS pts
      FROM contribution_evidence ce WHERE ce.project_id = p_project_id GROUP BY ce.user_id
  ),
  scored AS (
    SELECT u.user_id, u.full_name,
           COALESCE(ts.done, 0)::int AS tasks_completed,
           COALESCE(ts.hours, 0)     AS hours_logged,
           COALESCE(ev.pts, 0)       AS evidence_points,
           ROUND(3 * COALESCE(ts.done, 0) + 0.5 * COALESCE(ts.hours, 0) + COALESCE(ev.pts, 0), 2) AS raw_score
      FROM members mb
      JOIN users u ON u.user_id = mb.user_id
      LEFT JOIN task_stats ts ON ts.user_id = mb.user_id
      LEFT JOIN ev            ON ev.user_id = mb.user_id
  )
  SELECT s.user_id, s.full_name, s.tasks_completed, s.hours_logged, s.evidence_points, s.raw_score,
         ROUND(100 * s.raw_score / NULLIF(SUM(s.raw_score) OVER (), 0), 1)
    FROM scored s
   ORDER BY s.raw_score DESC;
$$;

-- ---------------------------------------------------------------------
-- (b) Audit trigger: logs every change of a `status` column.
-- The app sets `app.current_user_id` per transaction (see withTransaction()).
-- TG_ARGV[0] is the name of the primary-key column of the audited table.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_audit_status_change()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_user BIGINT := NULLIF(current_setting('app.current_user_id', true), '')::BIGINT;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO audit_logs (table_name, record_id, action, old_data, new_data, changed_by)
    VALUES (TG_TABLE_NAME,
            to_jsonb(NEW) ->> TG_ARGV[0],
            'STATUS_CHANGE',
            jsonb_build_object('status', OLD.status),
            jsonb_build_object('status', NEW.status),
            v_user);
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_projects_status_audit
  AFTER UPDATE OF status ON projects
  FOR EACH ROW EXECUTE FUNCTION fn_audit_status_change('project_id');
CREATE TRIGGER trg_milestones_status_audit
  AFTER UPDATE OF status ON milestones
  FOR EACH ROW EXECUTE FUNCTION fn_audit_status_change('milestone_id');
CREATE TRIGGER trg_tasks_status_audit
  AFTER UPDATE OF status ON tasks
  FOR EACH ROW EXECUTE FUNCTION fn_audit_status_change('task_id');
CREATE TRIGGER trg_feedback_status_audit
  AFTER UPDATE OF status ON feedback_items
  FOR EACH ROW EXECUTE FUNCTION fn_audit_status_change('feedback_id');

-- Keep projects.updated_at current.
CREATE OR REPLACE FUNCTION fn_touch_updated_at() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
CREATE TRIGGER trg_projects_touch BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

-- ---------------------------------------------------------------------
-- (c) Faculty dashboard view: progress + overdue counts + latest risk.
-- LATERAL sub-selects aggregate each child table independently, avoiding
-- the row fan-out you get from joining milestones x tasks x feedback.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_project_dashboard AS
SELECT p.project_id,
       p.title,
       p.status,
       t.team_id,
       t.name              AS team_name,
       c.code              AS course_code,
       d.code              AS department_code,
       d.name              AS department_name,
       ga.guide_id,
       g.full_name         AS guide_name,
       COALESCE(ms.total, 0)            AS total_milestones,
       COALESCE(ms.approved, 0)         AS approved_milestones,
       COALESCE(ms.overdue, 0)          AS overdue_milestones,
       ms.next_due,
       ROUND(100 * ms.approved_weight / NULLIF(ms.total_weight, 0), 1) AS progress_pct,
       COALESCE(tk.overdue, 0)          AS overdue_tasks,
       COALESCE(tk.blocked, 0)          AS blocked_tasks,
       COALESCE(fb.open_items, 0)       AS open_feedback,
       COALESCE(ra.risk_score, 0)       AS risk_score,
       COALESCE(ra.risk_level, 'unassessed') AS risk_level,
       ra.assessed_at
FROM projects p
JOIN teams t        ON t.team_id = p.team_id
JOIN courses c      ON c.course_id = p.course_id
JOIN departments d  ON d.department_id = c.department_id
LEFT JOIN guide_allocations ga ON ga.project_id = p.project_id AND ga.is_active
LEFT JOIN users g   ON g.user_id = ga.guide_id
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
  SELECT r.risk_score, r.risk_level, r.assessed_at FROM risk_assessments r
   WHERE r.project_id = p.project_id ORDER BY r.assessed_at DESC LIMIT 1) ra ON TRUE;
