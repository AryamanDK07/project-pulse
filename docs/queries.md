# Important queries and operations

Each query below runs in the application (file shown) — none are written only for the report.
Run any of them in `psql` against the seeded database to see the output.

## 1. DML through the API

| Operation | SQL | Where |
|---|---|---|
| Create proposal, milestone, task, deliverable, feedback, evidence | `INSERT … RETURNING` inside `withTransaction()` | `api/proposals`, `api/milestones/manage`, `api/tasks`, `api/milestones`, `api/feedback`, `api/contributions` |
| Insert only if the user is on the team | `INSERT INTO task_assignments (task_id, user_id) SELECT $1, $2 WHERE fn_is_team_member($3, $2)` | `api/tasks` |
| Upsert a peer evaluation | `INSERT … ON CONFLICT (project_id, evaluator_id, evaluatee_id) DO UPDATE SET rating = EXCLUDED.rating` | `api/contributions` |
| Controlled status transitions | `UPDATE feedback_items SET status = $2 … WHERE feedback_id = $1` after `SELECT … FOR UPDATE` checks the allowed *from* state | `api/feedback` |
| Remove an incorrect task / assignment / team member / Git record | `DELETE FROM tasks WHERE task_id = $1` (assignments cascade; audit trigger records the old row) | `api/tasks`, `api/teams`, `api/contributions` |

## 2. JOIN + GROUP BY + HAVING — teams over a threshold of overdue tasks
`src/app/api/reports/route.ts`
```sql
SELECT t.team_id, t.name AS team_name, p.project_id, p.title,
       COUNT(k.task_id)                AS overdue_tasks,
       MAX(CURRENT_DATE - k.due_date)  AS worst_days_late
  FROM teams t
  JOIN projects p   ON p.team_id = t.team_id
  JOIN milestones m ON m.project_id = p.project_id
  JOIN tasks k      ON k.milestone_id = m.milestone_id
 WHERE k.status <> 'done' AND k.due_date < CURRENT_DATE
 GROUP BY t.team_id, p.project_id
HAVING COUNT(k.task_id) >= $2          -- threshold chosen in the UI
 ORDER BY overdue_tasks DESC, worst_days_late DESC;
```

## 3. Delayed / high-risk projects — JOIN, aggregate FILTER, HAVING with OR, LATERAL
`src/app/api/risk-dashboard/route.ts`
```sql
SELECT p.project_id, p.title, …,
       COUNT(DISTINCT m.milestone_id) FILTER (
         WHERE m.due_date < CURRENT_DATE AND m.status IN ('pending','changes_requested')) AS overdue_milestones,
       COUNT(DISTINCT f.feedback_id) FILTER (WHERE f.status IN ('open','in_progress'))   AS open_feedback,
       COALESCE(ra.risk_score, 0) AS risk_score
  FROM projects p
  JOIN teams t ON … JOIN courses c ON … JOIN departments d ON …
  LEFT JOIN milestones m     ON m.project_id = p.project_id
  LEFT JOIN feedback_items f ON f.project_id = p.project_id
  LEFT JOIN LATERAL (SELECT risk_score, risk_level FROM risk_assessments r
                      WHERE r.project_id = p.project_id
                      ORDER BY assessed_at DESC LIMIT 1) ra ON TRUE
 GROUP BY p.project_id, …
HAVING COUNT(DISTINCT m.milestone_id) FILTER (WHERE …overdue…) >= $minOverdue
    OR COALESCE(ra.risk_score, 0) >= $minRisk
 ORDER BY risk_score DESC;
```
`COUNT(DISTINCT …)` prevents the row fan-out from joining milestones and feedback in one query.

## 4. Compare contribution among team members — conditional aggregation + window function
`db/postgres/004_governance_extensions.sql` → `fn_student_contribution_scores()`
```sql
-- per member: tasks done, hours, evidence weight, commits, documents, verified feedback, peer rating
SELECT …, ROUND(100 * s.raw_score / NULLIF(SUM(s.raw_score) OVER (), 0), 1) AS contribution_pct
  FROM scored s ORDER BY s.raw_score DESC;
```
Imbalance report (`api/reports`):
```sql
SELECT project_id, MAX(contribution_pct) - MIN(contribution_pct) AS spread, …
  FROM v_contribution_summary
 GROUP BY project_id, project_title, team_name
HAVING COUNT(*) > 1 AND MAX(contribution_pct) - MIN(contribution_pct) >= $2;
```

## 5. Milestones with unresolved feedback — EXISTS + correlated subquery
```sql
SELECT m.milestone_id, m.title, p.title AS project_title,
       (SELECT COUNT(*) FROM feedback_items f
         WHERE f.milestone_id = m.milestone_id AND f.status IN ('open','in_progress')) AS open_items
  FROM milestones m JOIN projects p ON p.project_id = m.project_id
 WHERE EXISTS (SELECT 1 FROM feedback_items f
                WHERE f.milestone_id = m.milestone_id AND f.status IN ('open','in_progress'))
 ORDER BY open_items DESC;
```

## 6. Projects lacking mandatory deliverable types — anti-join (NOT EXISTS) + GROUP BY/HAVING
View `v_projects_missing_deliverables`:
```sql
SELECT p.project_id, p.title, array_agg(crd.document_type ORDER BY crd.document_type) AS missing_types
  FROM projects p
  JOIN course_required_documents crd ON crd.course_id = p.course_id
 WHERE p.status IN ('approved','in_progress')
   AND NOT EXISTS (SELECT 1 FROM deliverables d JOIN milestones m ON m.milestone_id = d.milestone_id
                    WHERE m.project_id = p.project_id AND d.document_type = crd.document_type
                      AND d.current_version_no > 0)
 GROUP BY p.project_id, …
HAVING COUNT(*) > 0;
```

## 7. Similar proposals — pgvector cosine distance with metadata filters
`fn_similar_projects(embedding, limit, exclude, min_similarity, course_id)`
```sql
SELECT p.project_id, p.title, left(e.source_text, 400) AS matched_text,
       ROUND((1 - (e.embedding <=> $1))::numeric, 4) AS similarity
  FROM project_embeddings e JOIN projects p ON p.project_id = e.project_id
 WHERE e.project_id <> $exclude AND p.course_id = $course AND p.status <> 'rejected'
   AND 1 - (e.embedding <=> $1) >= $min_similarity
 ORDER BY e.embedding <=> $1          -- served by the HNSW index (vector_cosine_ops)
 LIMIT $limit;
```

## 8. Keyword full-text search — tsvector + GIN + ranking
```sql
SELECT project_id, title,
       ts_rank(search_tsv, websearch_to_tsquery('english', $1)) AS rank,
       ts_headline('english', abstract, websearch_to_tsquery('english', $1)) AS snippet
  FROM projects
 WHERE search_tsv @@ websearch_to_tsquery('english', $1)
 ORDER BY rank DESC;
```

## 9. MongoDB aggregation — document versions per project
`src/lib/srs.ts` → `documentStats()`
```js
[{ $match: { projectId: { $in: ids } } },
 { $unwind: '$versions' },
 { $group: { _id: { deliverableId: '$deliverableId', projectId: '$projectId', documentType: '$documentType' },
             versions: { $sum: 1 }, latestUpload: { $max: '$versions.createdAt' } } },
 { $group: { _id: '$_id.projectId', documents: { $sum: 1 }, totalVersions: { $sum: '$versions' },
             latestUpload: { $max: '$latestUpload' }, documentTypes: { $addToSet: '$_id.documentType' } } },
 { $sort: { _id: 1 } }]
```
Two more pipelines group `srs_change_log` by project × change type, and documents by type.

## 10. Atomic milestone submission (transaction)
`src/app/api/milestones/route.ts` — one `BEGIN … COMMIT`:
1. `SELECT … FROM milestones … FOR UPDATE` (row lock, checks state)
2. `INSERT INTO deliverables … ON CONFLICT (milestone_id) DO UPDATE`
3. `INSERT INTO document_versions …` (next `version_no`)
4. MongoDB: push the version with its sections (if this fails, PostgreSQL rolls back)
5. `UPDATE milestones SET status = 'submitted'` (status trigger → `audit_logs`)
6. `INSERT INTO audit_logs … 'SUBMIT_DELIVERABLE'`

If the PostgreSQL `COMMIT` fails after MongoDB was written, a compensating delete removes the Mongo version (saga).
