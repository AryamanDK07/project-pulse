-- Demo data. All accounts use password: password123
INSERT INTO roles(role_id, role_name) VALUES (1,'student'),(2,'faculty'),(3,'coordinator'),(4,'admin'),(5,'reviewer');
INSERT INTO departments(department_id, name, code) VALUES
  (1,'Computer Science & Engineering','CSE'),(2,'Information Science','ISE');

INSERT INTO users(user_id, email, password_hash, full_name, department_id, enrollment_no) VALUES
  (1,'admin@pulse.edu',       crypt('password123', gen_salt('bf')),'Asha Admin',      1,NULL),
  (2,'coordinator@pulse.edu', crypt('password123', gen_salt('bf')),'Colin Coordinator',1,NULL),
  (3,'guide1@pulse.edu',      crypt('password123', gen_salt('bf')),'Dr. Meera Rao',   1,NULL),
  (4,'guide2@pulse.edu',      crypt('password123', gen_salt('bf')),'Dr. Kiran Shah',  1,NULL),
  (5,'alice@pulse.edu',       crypt('password123', gen_salt('bf')),'Alice Nair',      1,'CSE001'),
  (6,'bob@pulse.edu',         crypt('password123', gen_salt('bf')),'Bob Iyer',        1,'CSE002'),
  (7,'carol@pulse.edu',       crypt('password123', gen_salt('bf')),'Carol Das',       1,'CSE003'),
  (8,'dave@pulse.edu',        crypt('password123', gen_salt('bf')),'Dave Menon',      1,'CSE004'),
  (9,'erin@pulse.edu',        crypt('password123', gen_salt('bf')),'Erin Paul',       1,'CSE005'),
  (10,'reviewer@pulse.edu',   crypt('password123', gen_salt('bf')),'Prof. Anil Kumar',1,NULL);
INSERT INTO user_roles(user_id, role_id) VALUES (1,4),(2,3),(3,2),(4,2),(5,1),(6,1),(7,1),(8,1),(9,1),(10,5);

INSERT INTO courses(course_id, department_id, code, title, semester, academic_year)
VALUES (1,1,'CS499','Capstone Project','8','2025-26');
INSERT INTO teams(team_id, course_id, name) VALUES (1,1,'Team Alpha'),(2,1,'Team Beta'),(3,1,'Team Gamma');
INSERT INTO team_members(team_id, user_id, member_role, responsibility) VALUES
  (1,5,'leader','Database design, SQL queries, documentation'),
  (1,6,'member','Next.js UI, API routes, testing'),
  (2,7,'leader','Face-recognition model, data pipeline'),
  (2,8,'member','Camera integration, web dashboard'),
  (3,9,'leader','Full stack');
-- Mandatory document types for the capstone course
INSERT INTO course_required_documents(course_id, document_type) VALUES (1,'srs'),(1,'design'),(1,'report');

INSERT INTO projects(project_id, team_id, course_id, title, abstract, problem_statement, objectives, scope,
                     domain, technologies, repository_url, status, start_date, created_by) VALUES
 (1,1,1,'AI-Based Plagiarism Detection for Student Reports',
  'A system that uses natural language processing and text embeddings to detect plagiarism in student project reports and highlight similar passages.',
  'Faculty cannot manually compare every report against previous submissions, so copied passages go unnoticed.',
  ARRAY['Detect copied passages across reports','Highlight matching text for faculty','Keep a history of checked reports'],
  'Text reports in PDF/DOCX; English only in version 1.', 'Education Technology',
  ARRAY['Python','FastAPI','PostgreSQL'], 'https://github.com/example/team-alpha',
  'in_progress', CURRENT_DATE - 60, 5),
 (2,2,1,'Smart Campus Attendance using Face Recognition',
  'A camera based attendance platform that recognises students in classrooms using a deep learning face recognition model and logs presence automatically.',
  'Roll-call attendance wastes lecture time and is easy to fake by answering for absent friends.',
  ARRAY['Recognise enrolled students from a classroom camera','Log attendance automatically','Show attendance reports to faculty'],
  'Single classroom pilot; enrolled students only.', 'Computer Vision',
  ARRAY['Python','OpenCV','React'], 'https://github.com/example/team-beta',
  'in_progress', CURRENT_DATE - 45, 7),
 (3,3,1,'Automated Originality Checker for Academic Reports using NLP',
  'A tool that applies natural language processing and text embeddings to check student academic reports for plagiarism and measure originality.',
  'Students submit reports that reuse earlier work, and faculty have no quick way to measure originality.',
  ARRAY['Score each report for originality','Show the closest earlier reports'],
  'Course reports only.', 'Education Technology',
  ARRAY['Python','Transformers'], NULL,
  'proposed', NULL, 9);

INSERT INTO guide_allocations(project_id, guide_id, allocation_role) VALUES
  (1,3,'guide'),(2,3,'guide'),(3,4,'guide'),
  (1,10,'reviewer'),(2,10,'reviewer');

INSERT INTO milestones(milestone_id, project_id, title, sequence_no, due_date, status, weight, submitted_at, approved_at, required_evidence_type) VALUES
 (1,1,'Proposal & SRS',   1, CURRENT_DATE-40,'approved', 20, now()-INTERVAL '42 days', now()-INTERVAL '38 days','srs'),
 (2,1,'Design Document',  2, CURRENT_DATE-10,'pending',  25, NULL, NULL,'design'),
 (3,1,'Prototype Demo',   3, CURRENT_DATE+20,'pending',  30, NULL, NULL,'source_code'),
 (4,1,'Final Report',     4, CURRENT_DATE+50,'pending',  25, NULL, NULL,'report'),
 (5,2,'Proposal & SRS',   1, CURRENT_DATE-30,'submitted',20, now()-INTERVAL '2 days', NULL,'srs'),
 (6,2,'Design Document',  2, CURRENT_DATE+5, 'pending',  30, NULL, NULL,'design'),
 (7,2,'Final Report',     3, CURRENT_DATE+40,'pending',  50, NULL, NULL,'report');

INSERT INTO tasks(task_id, milestone_id, title, status, priority, due_date, estimated_hours, completed_at, created_by) VALUES
 (1,1,'Write SRS draft','done','high',CURRENT_DATE-45,10, now()-INTERVAL '44 days',5),
 (2,2,'ER diagram','in_progress','high',CURRENT_DATE-12,6,NULL,5),
 (3,2,'API specification','blocked','medium',CURRENT_DATE-11,8,NULL,6),
 (4,3,'Model training pipeline','todo','high',CURRENT_DATE+10,20,NULL,5),
 (5,5,'Write SRS draft','done','high',CURRENT_DATE-33,10, now()-INTERVAL '30 days',7),
 (6,6,'Wireframes','in_progress','medium',CURRENT_DATE+2,5,NULL,8),
 (7,5,'Collect sample face dataset','done','medium',CURRENT_DATE-31,6, now()-INTERVAL '31 days',8);
INSERT INTO task_assignments(task_id, user_id, hours_logged) VALUES (1,5,6),(1,6,4),(2,6,3),(3,5,1),(5,7,7),(5,8,3),(6,8,2),(7,8,4);

INSERT INTO deliverables(deliverable_id, milestone_id, submitted_by, title, current_version_no, document_type) VALUES
 (1,1,5,'SRS',2,'srs'),(2,5,7,'SRS',1,'srs');
INSERT INTO document_versions(deliverable_id, version_no, file_name, checksum, change_summary, uploaded_by, uploaded_at) VALUES
 (1,1,'srs_v1.pdf', encode(digest('alpha-v1','sha256'),'hex'),'Initial SRS',5, now()-INTERVAL '45 days'),
 (1,2,'srs_v2.pdf', encode(digest('alpha-v2','sha256'),'hex'),'Added non-functional requirements',5, now()-INTERVAL '42 days'),
 (2,1,'srs.pdf',    encode(digest('beta-v1','sha256'),'hex'),'Initial SRS',7, now()-INTERVAL '2 days');

INSERT INTO reviews(milestone_id, reviewer_id, decision, score, comments)
VALUES (1,3,'approved',82.5,'Good requirement coverage.');

INSERT INTO feedback_items(project_id, milestone_id, author_id, body, severity, status, resolution_note, resolved_by, resolved_at, assigned_to) VALUES
 (1,1,3,'Add non-functional requirements for scalability.','medium','verified','Added NFR section 4.',5, now()-INTERVAL '36 days',5),
 (1,2,3,'ER diagram is missing the audit entity.','high','open',NULL,NULL,NULL,6),
 (2,5,3,'Clarify user roles in SRS section 2.','high','open',NULL,NULL,NULL,7),
 (1,NULL,3,'Provide a weekly progress log.','critical','open',NULL,NULL,NULL,5);

INSERT INTO contribution_evidence(project_id, user_id, task_id, evidence_type, description, weight) VALUES
 (1,5,1,'document','SRS authoring',3),(1,6,1,'commit','Repository setup',1.5),
 (1,5,NULL,'meeting','Guide meeting notes',1),
 (2,7,5,'document','SRS authoring',4),(2,8,NULL,'commit','Camera module prototype',2);

INSERT INTO git_activities(project_id, user_id, task_id, commit_sha, message, committed_at) VALUES
 (1,6,1,'a1b2c3d','Initial repository structure', now()-INTERVAL '50 days'),
 (1,6,NULL,'b2c3d4e5','Add login page skeleton', now()-INTERVAL '20 days'),
 (1,5,1,'c3d4e5f6','SRS markdown draft', now()-INTERVAL '45 days'),
 (2,8,7,'d4e5f6a7','Face dataset loader', now()-INTERVAL '31 days'),
 (2,8,NULL,'e5f6a7b8','Camera capture prototype', now()-INTERVAL '10 days');

INSERT INTO peer_evaluations(project_id, evaluator_id, evaluatee_id, rating, comments) VALUES
 (1,5,6,4,'Reliable on UI work'),(1,6,5,5,'Drove the SRS and database design'),
 (2,7,8,3,'Needs to update the task board more often'),(2,8,7,4,'Good ML work');

-- Re-sync identity sequences after explicit-id inserts
DO $$ DECLARE r RECORD; BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('roles','role_id'),('departments','department_id'),('users','user_id'),('courses','course_id'),
    ('teams','team_id'),('projects','project_id'),('milestones','milestone_id'),('tasks','task_id'),
    ('deliverables','deliverable_id')) AS v(t,c)
  LOOP
    EXECUTE format('SELECT setval(pg_get_serial_sequence(%L,%L), COALESCE((SELECT MAX(%I) FROM %I),1))', r.t, r.c, r.c, r.t);
  END LOOP;
END $$;

CALL sp_refresh_risk_assessments();
