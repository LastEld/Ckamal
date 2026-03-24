-- CogniMesh v5.0 Test Data
-- Run: psql -d cognimesh_test -f test-data.sql

-- Clear existing test data
TRUNCATE TABLE cv_registry, tasks, workflows, users, sessions, audit_logs RESTART IDENTITY CASCADE;

-- Insert test users
INSERT INTO users (id, username, email, password_hash, role, created_at, updated_at) VALUES
('user-001', 'admin', 'admin@example.com', '$2b$10$...hash...', 'admin', NOW(), NOW()),
('user-002', 'testuser', 'test@example.com', '$2b$10$...hash...', 'user', NOW(), NOW()),
('user-003', 'reviewer', 'reviewer@example.com', '$2b$10$...hash...', 'reviewer', NOW(), NOW()),
('user-004', 'developer1', 'dev1@example.com', '$2b$10$...hash...', 'user', NOW(), NOW()),
('user-005', 'developer2', 'dev2@example.com', '$2b$10$...hash...', 'user', NOW(), NOW());

-- Insert test CVs
INSERT INTO cv_registry (
  id, user_id, name, version, email, phone, location, summary, 
  skills, experience, education, certifications, projects, 
  status, created_at, updated_at, metadata
) VALUES
(
  'cv-001',
  'user-002',
  'John Developer',
  '1.0.0',
  'john@example.com',
  '+1234567890',
  'San Francisco, CA',
  'Full-stack developer with 5 years experience',
  '["JavaScript", "Node.js", "React", "Python"]',
  '[
    {
      "company": "TechCorp",
      "role": "Senior Developer",
      "startDate": "2020-01-01",
      "description": "Leading frontend development"
    }
  ]',
  '[
    {
      "institution": "Tech University",
      "degree": "BS Computer Science",
      "graduationYear": 2019
    }
  ]',
  '[
    {
      "name": "AWS Solutions Architect",
      "issuer": "Amazon",
      "date": "2023-01-01"
    }
  ]',
  '[
    {
      "name": "Personal Portfolio",
      "description": "Built with React",
      "url": "https://example.com"
    }
  ]',
  'published',
  NOW() - INTERVAL '30 days',
  NOW() - INTERVAL '5 days',
  '{"views": 150, "downloads": 25}'
),
(
  'cv-002',
  'user-004',
  'Jane Engineer',
  '1.0.0',
  'jane@example.com',
  '+0987654321',
  'New York, NY',
  'Backend engineer specializing in distributed systems',
  '["Go", "Rust", "PostgreSQL", "Kubernetes"]',
  '[
    {
      "company": "CloudSystems",
      "role": "Backend Engineer",
      "startDate": "2019-06-01",
      "description": "Building scalable microservices"
    },
    {
      "company": "StartupXYZ",
      "role": "Junior Developer",
      "startDate": "2018-01-01",
      "endDate": "2019-05-31",
      "description": "Full-stack development"
    }
  ]',
  '[
    {
      "institution": "Engineering College",
      "degree": "MS Software Engineering",
      "graduationYear": 2018
    }
  ]',
  '[]',
  '[]',
  'active',
  NOW() - INTERVAL '60 days',
  NOW() - INTERVAL '10 days',
  '{"views": 89, "downloads": 12}'
),
(
  'cv-003',
  'user-005',
  'Bob Designer',
  '2.0.0',
  'bob@example.com',
  '+1122334455',
  'Los Angeles, CA',
  'UI/UX designer with frontend skills',
  '["Figma", "Adobe XD", "React", "CSS", "Animation"]',
  '[
    {
      "company": "DesignStudio",
      "role": "UI/UX Designer",
      "startDate": "2021-03-01",
      "description": "Designing user interfaces"
    }
  ]',
  '[
    {
      "institution": "Art Institute",
      "degree": "BFA Design",
      "graduationYear": 2021
    }
  ]',
  '[
    {
      "name": "Google UX Certificate",
      "issuer": "Google",
      "date": "2022-06-01"
    }
  ]',
  '[
    {
      "name": "Design System",
      "description": "Component library for enterprise",
      "url": "https://design.example.com"
    }
  ]',
  'draft',
  NOW() - INTERVAL '7 days',
  NOW() - INTERVAL '1 day',
  '{"views": 5, "downloads": 0}'
),
(
  'cv-004',
  'user-002',
  'John Developer',
  '1.1.0',
  'john@example.com',
  '+1234567890',
  'San Francisco, CA',
  'Full-stack developer with updated experience',
  '["JavaScript", "Node.js", "React", "Python", "TypeScript"]',
  '[
    {
      "company": "TechCorp",
      "role": "Senior Developer",
      "startDate": "2020-01-01",
      "description": "Leading frontend and backend development"
    },
    {
      "company": "AnotherCorp",
      "role": "Developer",
      "startDate": "2018-06-01",
      "endDate": "2019-12-31",
      "description": "Full-stack development"
    }
  ]',
  '[
    {
      "institution": "Tech University",
      "degree": "BS Computer Science",
      "graduationYear": 2018
    }
  ]',
  '[
    {
      "name": "AWS Solutions Architect",
      "issuer": "Amazon",
      "date": "2023-01-01"
    },
    {
      "name": "Google Cloud Professional",
      "issuer": "Google",
      "date": "2023-06-01"
    }
  ]',
  '[]',
  'archived',
  NOW() - INTERVAL '90 days',
  NOW() - INTERVAL '30 days',
  '{"views": 200, "downloads": 40, "archived_reason": "Updated version created"}'
);

-- Insert test tasks
INSERT INTO tasks (
  id, type, status, priority, payload, result, 
  created_by, created_at, started_at, completed_at, retry_count
) VALUES
(
  'task-001',
  'cv-analysis',
  'completed',
  8,
  '{"cvId": "cv-001", "analysisType": "skill-gap"}',
  '{"skillGaps": ["GraphQL", "Docker"], "recommendations": ["Learn GraphQL", "Practice containerization"]}',
  'user-002',
  NOW() - INTERVAL '2 hours',
  NOW() - INTERVAL '1 hour 55 minutes',
  NOW() - INTERVAL '1 hour 50 minutes',
  0
),
(
  'task-002',
  'cv-export',
  'completed',
  5,
  '{"cvId": "cv-001", "format": "pdf"}',
  '{"downloadUrl": "/exports/cv-001.pdf", "fileSize": 1024000}',
  'user-002',
  NOW() - INTERVAL '1 day',
  NOW() - INTERVAL '1 day' + INTERVAL '5 seconds',
  NOW() - INTERVAL '1 day' + INTERVAL '30 seconds',
  0
),
(
  'task-003',
  'batch-analysis',
  'running',
  9,
  '{"cvIds": ["cv-001", "cv-002", "cv-003"], "analysisType": "skill-trends"}',
  NULL,
  'user-001',
  NOW() - INTERVAL '30 minutes',
  NOW() - INTERVAL '25 minutes',
  NULL,
  0
),
(
  'task-004',
  'data-migration',
  'pending',
  3,
  '{"source": "legacy-db", "target": "new-db"}',
  NULL,
  'user-001',
  NOW() - INTERVAL '5 minutes',
  NULL,
  NULL,
  0
),
(
  'task-005',
  'cv-render',
  'failed',
  6,
  '{"cvId": "cv-invalid", "format": "pdf"}',
  '{"error": "CV not found", "code": "CV_NOT_FOUND"}',
  'user-004',
  NOW() - INTERVAL '2 hours',
  NOW() - INTERVAL '2 hours' + INTERVAL '2 seconds',
  NOW() - INTERVAL '2 hours' + INTERVAL '5 seconds',
  2
);

-- Insert test workflows
INSERT INTO workflows (
  id, name, status, definition, context, 
  created_by, created_at, started_at, completed_at
) VALUES
(
  'wf-001',
  'cv-onboarding',
  'completed',
  '{
    "stages": [
      {"name": "validate", "type": "task"},
      {"name": "analyze", "type": "task"},
      {"name": "notify", "type": "task"}
    ]
  }',
  '{"cvId": "cv-001", "userId": "user-002"}',
  'user-002',
  NOW() - INTERVAL '1 day',
  NOW() - INTERVAL '1 day',
  NOW() - INTERVAL '1 day' + INTERVAL '5 minutes'
),
(
  'wf-002',
  'skill-assessment',
  'running',
  '{
    "stages": [
      {"name": "extract-skills", "type": "task"},
      {"name": "compare-market", "type": "task"},
      {"name": "generate-report", "type": "task"}
    ]
  }',
  '{"cvIds": ["cv-001", "cv-002"]}',
  'user-001',
  NOW() - INTERVAL '1 hour',
  NOW() - INTERVAL '1 hour',
  NULL
),
(
  'wf-003',
  'data-cleanup',
  'pending',
  '{
    "stages": [
      {"name": "identify-orphaned", "type": "task"},
      {"name": "backup", "type": "task"},
      {"name": "delete", "type": "task"}
    ]
  }',
  '{}',
  'user-001',
  NOW(),
  NULL,
  NULL
);

-- Insert test sessions
INSERT INTO sessions (
  id, user_id, token, expires_at, created_at, last_active_at, metadata
) VALUES
(
  'sess-001',
  'user-002',
  'test-token-abc123',
  NOW() + INTERVAL '24 hours',
  NOW() - INTERVAL '2 hours',
  NOW() - INTERVAL '15 minutes',
  '{"ip": "192.168.1.1", "userAgent": "Mozilla/5.0..."}'
),
(
  'sess-002',
  'user-001',
  'admin-token-xyz789',
  NOW() + INTERVAL '24 hours',
  NOW() - INTERVAL '5 hours',
  NOW() - INTERVAL '5 minutes',
  '{"ip": "192.168.1.2", "userAgent": "Mozilla/5.0..."}'
);

-- Insert audit logs
INSERT INTO audit_logs (
  id, user_id, action, resource_type, resource_id, 
  old_value, new_value, timestamp, ip_address
) VALUES
(
  'log-001',
  'user-002',
  'cv:create',
  'cv',
  'cv-001',
  NULL,
  '{"name": "John Developer", "version": "1.0.0"}',
  NOW() - INTERVAL '30 days',
  '192.168.1.1'
),
(
  'log-002',
  'user-002',
  'cv:update',
  'cv',
  'cv-001',
  '{"version": "1.0.0"}',
  '{"version": "1.1.0", "summary": "Updated summary"}',
  NOW() - INTERVAL '5 days',
  '192.168.1.1'
),
(
  'log-003',
  'user-002',
  'cv:publish',
  'cv',
  'cv-001',
  '{"status": "draft"}',
  '{"status": "published", "publicUrl": "..."}',
  NOW() - INTERVAL '5 days',
  '192.168.1.1'
),
(
  'log-004',
  'user-001',
  'task:create',
  'task',
  'task-003',
  NULL,
  '{"type": "batch-analysis", "priority": 9}',
  NOW() - INTERVAL '30 minutes',
  '192.168.1.2'
);

-- Create indexes for test queries
CREATE INDEX IF NOT EXISTS idx_cv_status ON cv_registry(status);
CREATE INDEX IF NOT EXISTS idx_cv_user ON cv_registry(user_id);
CREATE INDEX IF NOT EXISTS idx_task_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_task_type ON tasks(type);
CREATE INDEX IF NOT EXISTS idx_workflow_status ON workflows(status);
