# Data dictionary (PostgreSQL)

Generated from the live database catalog by `npm run docs:dictionary`.

**25 tables.** PK = primary key, FK = foreign key, UQ = unique.

## audit_logs

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| audit_id | bigint | NOT NULL |  | PK |
| table_name | text | NOT NULL |  |  |
| record_id | text | NOT NULL |  |  |
| action | text | NOT NULL |  |  |
| old_data | jsonb | null |  |  |
| new_data | jsonb | null |  |  |
| changed_by | bigint | null |  |  |
| changed_at | timestamp with time zone | NOT NULL | now() |  |

**Constraints**

- `audit_logs_pkey` — PRIMARY KEY (audit_id)

**Indexes**

- `idx_audit_record` — USING btree (table_name, record_id)
- `idx_audit_time` — USING btree (changed_at DESC)

## contribution_evidence

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| evidence_id | bigint | NOT NULL |  | PK |
| project_id | bigint | NOT NULL |  | FK |
| user_id | bigint | NOT NULL |  | FK |
| task_id | bigint | null |  | FK |
| evidence_type | text | NOT NULL |  |  |
| description | text | NOT NULL |  |  |
| evidence_url | text | null |  |  |
| weight | numeric(6,2) | NOT NULL | 1 |  |
| recorded_at | timestamp with time zone | NOT NULL | now() |  |

**Constraints**

- `contribution_evidence_evidence_type_check` — CHECK ((evidence_type = ANY (ARRAY['commit'::text, 'document'::text, 'meeting'::text, 'review'::text, 'other'::text])))
- `contribution_evidence_weight_check` — CHECK ((weight >= (0)::numeric))
- `contribution_evidence_project_id_fkey` — FOREIGN KEY (project_id) REFERENCES projects(project_id) ON DELETE CASCADE
- `contribution_evidence_task_id_fkey` — FOREIGN KEY (task_id) REFERENCES tasks(task_id) ON DELETE SET NULL
- `contribution_evidence_user_id_fkey` — FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
- `contribution_evidence_pkey` — PRIMARY KEY (evidence_id)

**Indexes**

- `idx_evidence_project_user` — USING btree (project_id, user_id)

## course_required_documents

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| course_id | bigint | NOT NULL |  | FK, PK |
| document_type | text | NOT NULL |  | PK |

**Constraints**

- `course_required_documents_document_type_check` — CHECK ((document_type = ANY (ARRAY['proposal'::text, 'srs'::text, 'design'::text, 'source_code'::text, 'report'::text, 'presentation'::text, 'other'::text])))
- `course_required_documents_course_id_fkey` — FOREIGN KEY (course_id) REFERENCES courses(course_id) ON DELETE CASCADE
- `course_required_documents_pkey` — PRIMARY KEY (course_id, document_type)

## courses

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| course_id | bigint | NOT NULL |  | PK |
| department_id | bigint | NOT NULL |  | FK |
| code | text | NOT NULL |  | UQ |
| title | text | NOT NULL |  |  |
| semester | text | NOT NULL |  |  |
| academic_year | text | NOT NULL |  |  |

**Constraints**

- `courses_academic_year_check` — CHECK ((academic_year ~ '^\d{4}-\d{2}$'::text))
- `courses_department_id_fkey` — FOREIGN KEY (department_id) REFERENCES departments(department_id) ON DELETE RESTRICT
- `courses_pkey` — PRIMARY KEY (course_id)
- `courses_code_key` — UNIQUE (code)

**Indexes**

- `idx_courses_department` — USING btree (department_id)

## deliverables

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| deliverable_id | bigint | NOT NULL |  | PK |
| milestone_id | bigint | NOT NULL |  | FK, UQ |
| submitted_by | bigint | NOT NULL |  | FK |
| title | text | NOT NULL |  |  |
| current_version_no | integer | NOT NULL | 0 |  |
| created_at | timestamp with time zone | NOT NULL | now() |  |
| document_type | text | NOT NULL | 'other'::text |  |

**Constraints**

- `deliverables_current_version_no_check` — CHECK ((current_version_no >= 0))
- `deliverables_document_type_check` — CHECK ((document_type = ANY (ARRAY['proposal'::text, 'srs'::text, 'design'::text, 'source_code'::text, 'report'::text, 'presentation'::text, 'other'::text])))
- `deliverables_milestone_id_fkey` — FOREIGN KEY (milestone_id) REFERENCES milestones(milestone_id) ON DELETE CASCADE
- `deliverables_submitted_by_fkey` — FOREIGN KEY (submitted_by) REFERENCES users(user_id) ON DELETE RESTRICT
- `deliverables_pkey` — PRIMARY KEY (deliverable_id)
- `deliverables_milestone_id_key` — UNIQUE (milestone_id)

**Indexes**

- `idx_deliverables_type` — USING btree (document_type)

## departments

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| department_id | bigint | NOT NULL |  | PK |
| name | text | NOT NULL |  | UQ |
| code | text | NOT NULL |  | UQ |

**Constraints**

- `departments_code_check` — CHECK ((code = upper(code)))
- `departments_pkey` — PRIMARY KEY (department_id)
- `departments_code_key` — UNIQUE (code)
- `departments_name_key` — UNIQUE (name)

## document_versions

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| version_id | bigint | NOT NULL |  | PK |
| deliverable_id | bigint | NOT NULL |  | FK, UQ |
| version_no | integer | NOT NULL |  | UQ |
| file_name | text | NOT NULL |  |  |
| file_url | text | null |  |  |
| checksum | text | NOT NULL |  |  |
| mongo_version_id | text | null |  |  |
| change_summary | text | NOT NULL |  |  |
| uploaded_by | bigint | NOT NULL |  | FK |
| uploaded_at | timestamp with time zone | NOT NULL | now() |  |

**Constraints**

- `document_versions_version_no_check` — CHECK ((version_no > 0))
- `document_versions_deliverable_id_fkey` — FOREIGN KEY (deliverable_id) REFERENCES deliverables(deliverable_id) ON DELETE CASCADE
- `document_versions_uploaded_by_fkey` — FOREIGN KEY (uploaded_by) REFERENCES users(user_id) ON DELETE RESTRICT
- `document_versions_pkey` — PRIMARY KEY (version_id)
- `document_versions_deliverable_id_version_no_key` — UNIQUE (deliverable_id, version_no)

**Indexes**

- `idx_document_versions_uploaded` — USING btree (deliverable_id, uploaded_at DESC)

## feedback_items

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| feedback_id | bigint | NOT NULL |  | PK |
| review_id | bigint | null |  | FK |
| milestone_id | bigint | null |  | FK |
| project_id | bigint | NOT NULL |  | FK |
| author_id | bigint | NOT NULL |  | FK |
| body | text | NOT NULL |  |  |
| severity | text | NOT NULL | 'medium'::text |  |
| status | text | NOT NULL | 'open'::text |  |
| resolution_note | text | null |  |  |
| resolved_by | bigint | null |  | FK |
| resolved_at | timestamp with time zone | null |  |  |
| created_at | timestamp with time zone | NOT NULL | now() |  |
| assigned_to | bigint | null |  | FK |

**Constraints**

- `feedback_items_body_check` — CHECK ((char_length(body) >= 3))
- `feedback_items_check` — CHECK (((status <> ALL (ARRAY['resolved'::text, 'verified'::text])) OR ((resolved_at IS NOT NULL) AND (resolution_note IS NOT NULL))))
- `feedback_items_severity_check` — CHECK ((severity = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'critical'::text])))
- `feedback_items_status_check` — CHECK ((status = ANY (ARRAY['open'::text, 'in_progress'::text, 'resolved'::text, 'verified'::text, 'wont_fix'::text])))
- `feedback_items_assigned_to_fkey` — FOREIGN KEY (assigned_to) REFERENCES users(user_id) ON DELETE SET NULL
- `feedback_items_author_id_fkey` — FOREIGN KEY (author_id) REFERENCES users(user_id) ON DELETE RESTRICT
- `feedback_items_milestone_id_fkey` — FOREIGN KEY (milestone_id) REFERENCES milestones(milestone_id) ON DELETE CASCADE
- `feedback_items_project_id_fkey` — FOREIGN KEY (project_id) REFERENCES projects(project_id) ON DELETE CASCADE
- `feedback_items_resolved_by_fkey` — FOREIGN KEY (resolved_by) REFERENCES users(user_id) ON DELETE SET NULL
- `feedback_items_review_id_fkey` — FOREIGN KEY (review_id) REFERENCES reviews(review_id) ON DELETE SET NULL
- `feedback_items_pkey` — PRIMARY KEY (feedback_id)

**Indexes**

- `idx_feedback_assigned` — USING btree (assigned_to) WHERE (assigned_to IS NOT NULL)
- `idx_feedback_open_severity` — USING btree (severity) WHERE (status = ANY (ARRAY['open'::text, 'in_progress'::text]))
- `idx_feedback_project_status` — USING btree (project_id, status)

## git_activities

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| activity_id | bigint | NOT NULL |  | PK |
| project_id | bigint | NOT NULL |  | FK, UQ |
| user_id | bigint | NOT NULL |  | FK |
| task_id | bigint | null |  | FK |
| commit_sha | text | NOT NULL |  | UQ |
| commit_url | text | null |  |  |
| message | text | NOT NULL |  |  |
| committed_at | timestamp with time zone | NOT NULL | now() |  |
| recorded_at | timestamp with time zone | NOT NULL | now() |  |

**Constraints**

- `git_activities_check` — CHECK ((committed_at <= (recorded_at + '1 day'::interval)))
- `git_activities_commit_sha_check` — CHECK ((commit_sha ~ '^[0-9a-f]{7,40}$'::text))
- `git_activities_commit_url_check` — CHECK (((commit_url IS NULL) OR (commit_url ~* '^https?://[^\s]+$'::text)))
- `git_activities_message_check` — CHECK (((char_length(message) >= 3) AND (char_length(message) <= 500)))
- `git_activities_project_id_fkey` — FOREIGN KEY (project_id) REFERENCES projects(project_id) ON DELETE CASCADE
- `git_activities_task_id_fkey` — FOREIGN KEY (task_id) REFERENCES tasks(task_id) ON DELETE SET NULL
- `git_activities_user_id_fkey` — FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
- `git_activities_pkey` — PRIMARY KEY (activity_id)
- `git_activities_project_id_commit_sha_key` — UNIQUE (project_id, commit_sha)

**Indexes**

- `idx_git_project_user` — USING btree (project_id, user_id)

## guide_allocations

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| allocation_id | bigint | NOT NULL |  | PK |
| project_id | bigint | NOT NULL |  | FK |
| guide_id | bigint | NOT NULL |  | FK |
| allocated_at | timestamp with time zone | NOT NULL | now() |  |
| is_active | boolean | NOT NULL | true |  |
| allocation_role | text | NOT NULL | 'guide'::text |  |

**Constraints**

- `guide_allocations_role_check` — CHECK ((allocation_role = ANY (ARRAY['guide'::text, 'reviewer'::text])))
- `guide_allocations_guide_id_fkey` — FOREIGN KEY (guide_id) REFERENCES users(user_id) ON DELETE RESTRICT
- `guide_allocations_project_id_fkey` — FOREIGN KEY (project_id) REFERENCES projects(project_id) ON DELETE CASCADE
- `guide_allocations_pkey` — PRIMARY KEY (allocation_id)

**Indexes**

- `idx_guide_allocations_guide` — USING btree (guide_id) WHERE is_active
- `uq_guide_allocations_active_role` — UNIQUE USING btree (project_id, allocation_role) WHERE is_active

## milestones

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| milestone_id | bigint | NOT NULL |  | PK |
| project_id | bigint | NOT NULL |  | FK, UQ |
| title | text | NOT NULL |  |  |
| description | text | null |  |  |
| sequence_no | integer | NOT NULL |  | UQ |
| due_date | date | NOT NULL |  |  |
| status | text | NOT NULL | 'pending'::text |  |
| weight | numeric(5,2) | NOT NULL | 10 |  |
| submitted_at | timestamp with time zone | null |  |  |
| approved_at | timestamp with time zone | null |  |  |
| required_evidence_type | text | null |  |  |

**Constraints**

- `milestones_check` — CHECK (((status <> 'approved'::text) OR (approved_at IS NOT NULL)))
- `milestones_required_evidence_type_check` — CHECK ((required_evidence_type = ANY (ARRAY['proposal'::text, 'srs'::text, 'design'::text, 'source_code'::text, 'report'::text, 'presentation'::text, 'other'::text])))
- `milestones_sequence_no_check` — CHECK ((sequence_no > 0))
- `milestones_status_check` — CHECK ((status = ANY (ARRAY['pending'::text, 'submitted'::text, 'under_review'::text, 'approved'::text, 'changes_requested'::text])))
- `milestones_weight_check` — CHECK (((weight > (0)::numeric) AND (weight <= (100)::numeric)))
- `milestones_project_id_fkey` — FOREIGN KEY (project_id) REFERENCES projects(project_id) ON DELETE CASCADE
- `milestones_pkey` — PRIMARY KEY (milestone_id)
- `milestones_project_id_sequence_no_key` — UNIQUE (project_id, sequence_no)

**Indexes**

- `idx_milestones_open_due` — USING btree (due_date) WHERE (status = ANY (ARRAY['pending'::text, 'changes_requested'::text]))
- `idx_milestones_project_due` — USING btree (project_id, due_date)

## peer_evaluations

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| evaluation_id | bigint | NOT NULL |  | PK |
| project_id | bigint | NOT NULL |  | FK, UQ |
| evaluator_id | bigint | NOT NULL |  | FK, UQ |
| evaluatee_id | bigint | NOT NULL |  | FK, UQ |
| rating | smallint | NOT NULL |  |  |
| comments | text | null |  |  |
| created_at | timestamp with time zone | NOT NULL | now() |  |

**Constraints**

- `peer_evaluations_check` — CHECK ((evaluator_id <> evaluatee_id))
- `peer_evaluations_comments_check` — CHECK (((comments IS NULL) OR (char_length(comments) <= 1000)))
- `peer_evaluations_rating_check` — CHECK (((rating >= 1) AND (rating <= 5)))
- `peer_evaluations_evaluatee_id_fkey` — FOREIGN KEY (evaluatee_id) REFERENCES users(user_id) ON DELETE CASCADE
- `peer_evaluations_evaluator_id_fkey` — FOREIGN KEY (evaluator_id) REFERENCES users(user_id) ON DELETE CASCADE
- `peer_evaluations_project_id_fkey` — FOREIGN KEY (project_id) REFERENCES projects(project_id) ON DELETE CASCADE
- `peer_evaluations_pkey` — PRIMARY KEY (evaluation_id)
- `peer_evaluations_project_id_evaluator_id_evaluatee_id_key` — UNIQUE (project_id, evaluator_id, evaluatee_id)

**Indexes**

- `idx_peer_evaluatee` — USING btree (project_id, evaluatee_id)

## project_embeddings

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| project_id | bigint | NOT NULL |  | FK, PK |
| embedding | vector(384) | NOT NULL |  |  |
| model | text | NOT NULL |  |  |
| content_hash | text | null |  |  |
| created_at | timestamp with time zone | NOT NULL | now() |  |
| source_text | text | null |  |  |

**Constraints**

- `project_embeddings_project_id_fkey` — FOREIGN KEY (project_id) REFERENCES projects(project_id) ON DELETE CASCADE
- `project_embeddings_pkey` — PRIMARY KEY (project_id)

**Indexes**

- `idx_project_embeddings_hnsw` — USING hnsw (embedding vector_cosine_ops)

## projects

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| project_id | bigint | NOT NULL |  | PK |
| team_id | bigint | NOT NULL |  | FK, UQ |
| course_id | bigint | NOT NULL |  | FK |
| title | text | NOT NULL |  |  |
| abstract | text | NOT NULL |  |  |
| status | text | NOT NULL | 'proposed'::text |  |
| start_date | date | null |  |  |
| end_date | date | null |  |  |
| created_by | bigint | null |  | FK |
| created_at | timestamp with time zone | NOT NULL | now() |  |
| updated_at | timestamp with time zone | NOT NULL | now() |  |
| problem_statement | text | null |  |  |
| objectives | text[] | NOT NULL | '{}'::text[] |  |
| scope | text | null |  |  |
| domain | text | null |  |  |
| technologies | text[] | NOT NULL | '{}'::text[] |  |
| repository_url | text | null |  |  |
| search_tsv | tsvector | null | GENERATED (stored) |  |

**Constraints**

- `projects_abstract_check` — CHECK ((char_length(abstract) >= 30))
- `projects_check` — CHECK (((end_date IS NULL) OR (start_date IS NULL) OR (end_date >= start_date)))
- `projects_repository_url_check` — CHECK (((repository_url IS NULL) OR (repository_url ~* '^https?://[^\s]+$'::text)))
- `projects_status_check` — CHECK ((status = ANY (ARRAY['proposed'::text, 'revision_requested'::text, 'approved'::text, 'in_progress'::text, 'completed'::text, 'rejected'::text])))
- `projects_title_check` — CHECK (((char_length(title) >= 5) AND (char_length(title) <= 200)))
- `projects_course_id_fkey` — FOREIGN KEY (course_id) REFERENCES courses(course_id) ON DELETE RESTRICT
- `projects_created_by_fkey` — FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE SET NULL
- `projects_team_id_fkey` — FOREIGN KEY (team_id) REFERENCES teams(team_id) ON DELETE CASCADE
- `projects_pkey` — PRIMARY KEY (project_id)
- `projects_team_id_key` — UNIQUE (team_id)

**Indexes**

- `idx_projects_course` — USING btree (course_id)
- `idx_projects_search_tsv` — USING gin (search_tsv)
- `idx_projects_status` — USING btree (status)
- `idx_projects_title_trgm` — USING gin (title gin_trgm_ops)

## reviews

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| review_id | bigint | NOT NULL |  | PK |
| milestone_id | bigint | NOT NULL |  | FK |
| reviewer_id | bigint | NOT NULL |  | FK |
| decision | text | NOT NULL |  |  |
| score | numeric(5,2) | null |  |  |
| comments | text | null |  |  |
| reviewed_at | timestamp with time zone | NOT NULL | now() |  |
| rubric | jsonb | null |  |  |

**Constraints**

- `reviews_decision_check` — CHECK ((decision = ANY (ARRAY['approved'::text, 'changes_requested'::text, 'commented'::text])))
- `reviews_score_check` — CHECK (((score IS NULL) OR ((score >= (0)::numeric) AND (score <= (100)::numeric))))
- `reviews_milestone_id_fkey` — FOREIGN KEY (milestone_id) REFERENCES milestones(milestone_id) ON DELETE CASCADE
- `reviews_reviewer_id_fkey` — FOREIGN KEY (reviewer_id) REFERENCES users(user_id) ON DELETE RESTRICT
- `reviews_pkey` — PRIMARY KEY (review_id)

**Indexes**

- `idx_reviews_milestone` — USING btree (milestone_id, reviewed_at DESC)

## risk_assessments

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| risk_id | bigint | NOT NULL |  | PK |
| project_id | bigint | NOT NULL |  | FK |
| risk_score | numeric(5,2) | NOT NULL |  |  |
| risk_level | text | NOT NULL |  |  |
| factors | jsonb | NOT NULL | '{}'::jsonb |  |
| assessed_at | timestamp with time zone | NOT NULL | now() |  |

**Constraints**

- `risk_assessments_risk_level_check` — CHECK ((risk_level = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'critical'::text])))
- `risk_assessments_risk_score_check` — CHECK (((risk_score >= (0)::numeric) AND (risk_score <= (100)::numeric)))
- `risk_assessments_project_id_fkey` — FOREIGN KEY (project_id) REFERENCES projects(project_id) ON DELETE CASCADE
- `risk_assessments_pkey` — PRIMARY KEY (risk_id)

**Indexes**

- `idx_risk_level` — USING btree (risk_level)
- `idx_risk_project_time` — USING btree (project_id, assessed_at DESC)

## risk_events

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| event_id | bigint | NOT NULL |  | PK |
| project_id | bigint | NOT NULL |  | FK |
| milestone_id | bigint | null |  | FK |
| event_type | text | NOT NULL |  |  |
| details | jsonb | NOT NULL | '{}'::jsonb |  |
| created_at | timestamp with time zone | NOT NULL | now() |  |
| resolved_at | timestamp with time zone | null |  |  |

**Constraints**

- `risk_events_check` — CHECK (((resolved_at IS NULL) OR (resolved_at >= created_at)))
- `risk_events_event_type_check` — CHECK ((event_type = ANY (ARRAY['milestone_overdue'::text, 'risk_escalated'::text])))
- `risk_events_milestone_id_fkey` — FOREIGN KEY (milestone_id) REFERENCES milestones(milestone_id) ON DELETE CASCADE
- `risk_events_project_id_fkey` — FOREIGN KEY (project_id) REFERENCES projects(project_id) ON DELETE CASCADE
- `risk_events_pkey` — PRIMARY KEY (event_id)

**Indexes**

- `idx_risk_events_project` — USING btree (project_id, created_at DESC)
- `uq_risk_events_open` — UNIQUE USING btree (milestone_id, event_type) WHERE (resolved_at IS NULL)

## roles

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| role_id | smallint | NOT NULL |  | PK |
| role_name | text | NOT NULL |  | UQ |

**Constraints**

- `roles_role_name_check` — CHECK ((role_name = ANY (ARRAY['student'::text, 'faculty'::text, 'reviewer'::text, 'coordinator'::text, 'admin'::text])))
- `roles_pkey` — PRIMARY KEY (role_id)
- `roles_role_name_key` — UNIQUE (role_name)

## similarity_reviews

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| similarity_id | bigint | NOT NULL |  | PK |
| project_id | bigint | NOT NULL |  | FK, UQ |
| matched_project_id | bigint | NOT NULL |  | FK, UQ |
| similarity_score | numeric(5,4) | NOT NULL |  |  |
| reviewer_id | bigint | null |  | FK |
| decision | text | NOT NULL | 'pending'::text |  |
| notes | text | null |  |  |
| created_at | timestamp with time zone | NOT NULL | now() |  |
| reviewed_at | timestamp with time zone | null |  |  |

**Constraints**

- `similarity_reviews_check` — CHECK ((project_id <> matched_project_id))
- `similarity_reviews_decision_check` — CHECK ((decision = ANY (ARRAY['pending'::text, 'acceptable'::text, 'plagiarism_suspected'::text, 'duplicate'::text])))
- `similarity_reviews_similarity_score_check` — CHECK (((similarity_score >= ('-1'::integer)::numeric) AND (similarity_score <= (1)::numeric)))
- `similarity_reviews_matched_project_id_fkey` — FOREIGN KEY (matched_project_id) REFERENCES projects(project_id) ON DELETE CASCADE
- `similarity_reviews_project_id_fkey` — FOREIGN KEY (project_id) REFERENCES projects(project_id) ON DELETE CASCADE
- `similarity_reviews_reviewer_id_fkey` — FOREIGN KEY (reviewer_id) REFERENCES users(user_id) ON DELETE SET NULL
- `similarity_reviews_pkey` — PRIMARY KEY (similarity_id)
- `similarity_reviews_project_id_matched_project_id_key` — UNIQUE (project_id, matched_project_id)

**Indexes**

- `idx_similarity_pending` — USING btree (project_id) WHERE (decision = 'pending'::text)

## task_assignments

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| task_id | bigint | NOT NULL |  | FK, PK |
| user_id | bigint | NOT NULL |  | FK, PK |
| assigned_at | timestamp with time zone | NOT NULL | now() |  |
| hours_logged | numeric(6,2) | NOT NULL | 0 |  |

**Constraints**

- `task_assignments_hours_logged_check` — CHECK ((hours_logged >= (0)::numeric))
- `task_assignments_task_id_fkey` — FOREIGN KEY (task_id) REFERENCES tasks(task_id) ON DELETE CASCADE
- `task_assignments_user_id_fkey` — FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
- `task_assignments_pkey` — PRIMARY KEY (task_id, user_id)

**Indexes**

- `idx_task_assignments_user` — USING btree (user_id)
- `idx_task_assignments_user_task` — USING btree (user_id, task_id)

## tasks

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| task_id | bigint | NOT NULL |  | PK |
| milestone_id | bigint | NOT NULL |  | FK |
| title | text | NOT NULL |  |  |
| description | text | null |  |  |
| status | text | NOT NULL | 'todo'::text |  |
| priority | text | NOT NULL | 'medium'::text |  |
| due_date | date | null |  |  |
| estimated_hours | numeric(6,2) | null |  |  |
| completed_at | timestamp with time zone | null |  |  |
| created_by | bigint | null |  | FK |

**Constraints**

- `tasks_check` — CHECK (((status <> 'done'::text) OR (completed_at IS NOT NULL)))
- `tasks_estimated_hours_check` — CHECK (((estimated_hours IS NULL) OR (estimated_hours > (0)::numeric)))
- `tasks_priority_check` — CHECK ((priority = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text])))
- `tasks_status_check` — CHECK ((status = ANY (ARRAY['todo'::text, 'in_progress'::text, 'done'::text, 'blocked'::text])))
- `tasks_created_by_fkey` — FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE SET NULL
- `tasks_milestone_id_fkey` — FOREIGN KEY (milestone_id) REFERENCES milestones(milestone_id) ON DELETE CASCADE
- `tasks_pkey` — PRIMARY KEY (task_id)

**Indexes**

- `idx_tasks_milestone_status` — USING btree (milestone_id, status)
- `idx_tasks_status_due` — USING btree (status, due_date)

## team_members

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| team_id | bigint | NOT NULL |  | FK, PK |
| user_id | bigint | NOT NULL |  | FK, PK |
| member_role | text | NOT NULL | 'member'::text |  |
| joined_at | timestamp with time zone | NOT NULL | now() |  |
| responsibility | text | null |  |  |

**Constraints**

- `team_members_member_role_check` — CHECK ((member_role = ANY (ARRAY['leader'::text, 'member'::text])))
- `team_members_team_id_fkey` — FOREIGN KEY (team_id) REFERENCES teams(team_id) ON DELETE CASCADE
- `team_members_user_id_fkey` — FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
- `team_members_pkey` — PRIMARY KEY (team_id, user_id)

**Indexes**

- `idx_team_members_user` — USING btree (user_id)

## teams

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| team_id | bigint | NOT NULL |  | PK |
| course_id | bigint | NOT NULL |  | FK, UQ |
| name | text | NOT NULL |  | UQ |
| created_at | timestamp with time zone | NOT NULL | now() |  |

**Constraints**

- `teams_course_id_fkey` — FOREIGN KEY (course_id) REFERENCES courses(course_id) ON DELETE CASCADE
- `teams_pkey` — PRIMARY KEY (team_id)
- `teams_course_id_name_key` — UNIQUE (course_id, name)

## user_roles

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| user_id | bigint | NOT NULL |  | FK, PK |
| role_id | smallint | NOT NULL |  | FK, PK |

**Constraints**

- `user_roles_role_id_fkey` — FOREIGN KEY (role_id) REFERENCES roles(role_id) ON DELETE RESTRICT
- `user_roles_user_id_fkey` — FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
- `user_roles_pkey` — PRIMARY KEY (user_id, role_id)

**Indexes**

- `idx_user_roles_role` — USING btree (role_id)

## users

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| user_id | bigint | NOT NULL |  | PK |
| email | text | NOT NULL |  | UQ |
| password_hash | text | NOT NULL |  |  |
| full_name | text | NOT NULL |  |  |
| department_id | bigint | null |  | FK |
| enrollment_no | text | null |  | UQ |
| is_active | boolean | NOT NULL | true |  |
| created_at | timestamp with time zone | NOT NULL | now() |  |

**Constraints**

- `users_email_check` — CHECK ((email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'::text))
- `users_department_id_fkey` — FOREIGN KEY (department_id) REFERENCES departments(department_id) ON DELETE SET NULL
- `users_pkey` — PRIMARY KEY (user_id)
- `users_email_key` — UNIQUE (email)
- `users_enrollment_no_key` — UNIQUE (enrollment_no)

**Indexes**

- `idx_users_department` — USING btree (department_id)

## Views

- `v_contribution_summary`
- `v_project_dashboard`
- `v_project_progress`
- `v_projects_missing_deliverables`
- `v_unresolved_feedback`

## Functions and procedures

- `fn_audit_delete()`
- `fn_audit_similarity_decision()`
- `fn_audit_status_change()`
- `fn_block_audit_mutation()`
- `fn_calculate_project_risk(p_project_id bigint)`
- `fn_documentation_completeness(p_project_id bigint)`
- `fn_flag_overdue_milestones()`
- `fn_is_team_member(p_project_id bigint, p_user_id bigint)`
- `fn_milestone_completion_pct(p_project_id bigint)`
- `fn_milestone_overdue_event()`
- `fn_risk_escalation_event()`
- `fn_similar_projects(p_embedding vector, p_limit integer, p_exclude bigint, p_min_similarity numeric, p_course_id bigint)`
- `fn_student_contribution_scores(p_project_id bigint)`
- `fn_touch_updated_at()`
- `fn_validate_due_dates()`
- `fn_validate_team_membership()`
- `sp_refresh_risk_assessments(IN p_project_id bigint)` — procedure

## Triggers

| Trigger | Table |
|---|---|
| `trg_audit_logs_immutable` | audit_logs |
| `trg_feedback_assignee_validate` | feedback_items |
| `trg_feedback_status_audit` | feedback_items |
| `trg_git_activities_delete_audit` | git_activities |
| `trg_git_activities_validate` | git_activities |
| `trg_milestones_overdue_event` | milestones |
| `trg_milestones_status_audit` | milestones |
| `trg_milestones_validate_dates` | milestones |
| `trg_peer_evaluations_validate` | peer_evaluations |
| `trg_projects_status_audit` | projects |
| `trg_projects_touch` | projects |
| `trg_risk_escalation_event` | risk_assessments |
| `trg_similarity_decision_audit` | similarity_reviews |
| `trg_task_assignments_delete_audit` | task_assignments |
| `trg_tasks_delete_audit` | tasks |
| `trg_tasks_status_audit` | tasks |
| `trg_tasks_validate_dates` | tasks |
| `trg_team_members_delete_audit` | team_members |
