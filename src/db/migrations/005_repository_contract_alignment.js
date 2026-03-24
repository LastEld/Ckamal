/**
 * Repository/schema contract alignment for tasks, roadmaps, contexts, and merkle persistence.
 */

function tableInfo(db, tableName) {
  return db.prepare(`PRAGMA table_info(${tableName})`).all();
}

function hasColumn(db, tableName, columnName) {
  return tableInfo(db, tableName).some(column => column.name === columnName);
}

function addColumnIfMissing(db, tableName, columnName, definition) {
  if (!hasColumn(db, tableName, columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${definition}`);
  }
}

function rebuildRoadmaps(db) {
  const roadmapColumns = new Set(tableInfo(db, 'roadmaps').map(column => column.name));
  const hasName = roadmapColumns.has('name');
  const hasParentId = roadmapColumns.has('parent_id');
  const hasStartDate = roadmapColumns.has('start_date');
  const hasTargetDate = roadmapColumns.has('target_date');
  const hasMilestones = roadmapColumns.has('milestones');

  db.exec(`
    DROP TRIGGER IF EXISTS trg_roadmaps_updated_at;
    DROP TRIGGER IF EXISTS trg_roadmaps_alias_insert;
    DROP TRIGGER IF EXISTS trg_roadmaps_alias_update;
  `);

  db.exec('PRAGMA foreign_keys = OFF');

  db.exec(`
    CREATE TABLE IF NOT EXISTS roadmaps_contract_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT NOT NULL UNIQUE DEFAULT (lower(hex(randomblob(16)))),
      owner_id INTEGER,
      title TEXT NOT NULL,
      name TEXT,
      description TEXT,
      status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'completed', 'archived', 'deleted')),
      visibility TEXT DEFAULT 'private' CHECK (visibility IN ('public', 'private', 'shared')),
      config TEXT DEFAULT '{}',
      parent_id INTEGER,
      started_at DATETIME,
      start_date DATETIME,
      target_at DATETIME,
      target_date DATETIME,
      completed_at DATETIME,
      milestones TEXT DEFAULT '[]',
      metadata TEXT DEFAULT '{}',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      deleted_at DATETIME,
      deleted_by INTEGER,
      FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (parent_id) REFERENCES roadmaps_contract_new(id) ON DELETE SET NULL,
      FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE SET NULL
    );
  `);

  db.exec(`
    INSERT INTO roadmaps_contract_new (
      id, uuid, owner_id, title, name, description, status, visibility, config,
      parent_id, started_at, start_date, target_at, target_date, completed_at,
      milestones, metadata, created_at, updated_at, deleted_at, deleted_by
    )
    SELECT
      id,
      uuid,
      owner_id,
      title,
      COALESCE(${hasName ? 'name' : 'NULL'}, title),
      description,
      CASE
        WHEN status = 'deleted' THEN 'deleted'
        WHEN status = 'archived' THEN 'archived'
        WHEN status = 'completed' THEN 'completed'
        WHEN status = 'active' THEN 'active'
        ELSE 'draft'
      END,
      visibility,
      COALESCE(config, '{}'),
      ${hasParentId ? 'parent_id' : 'NULL'},
      started_at,
      COALESCE(${hasStartDate ? 'start_date' : 'NULL'}, started_at),
      target_at,
      COALESCE(${hasTargetDate ? 'target_date' : 'NULL'}, target_at),
      completed_at,
      COALESCE(${hasMilestones ? 'milestones' : 'NULL'}, '[]'),
      COALESCE(metadata, '{}'),
      created_at,
      updated_at,
      deleted_at,
      deleted_by
    FROM roadmaps;
  `);

  db.exec(`
    DROP TABLE roadmaps;
    ALTER TABLE roadmaps_contract_new RENAME TO roadmaps;
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_roadmaps_owner ON roadmaps(owner_id) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_roadmaps_status ON roadmaps(status) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_roadmaps_visibility ON roadmaps(visibility) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_roadmaps_active
      ON roadmaps(owner_id, status, updated_at DESC)
      WHERE deleted_at IS NULL AND status = 'active';
    CREATE INDEX IF NOT EXISTS idx_roadmaps_parent
      ON roadmaps(parent_id, updated_at DESC)
      WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_roadmaps_list_view
      ON roadmaps(owner_id, status, updated_at DESC, title, uuid)
      WHERE deleted_at IS NULL;

    CREATE TRIGGER IF NOT EXISTS trg_roadmaps_updated_at
    AFTER UPDATE ON roadmaps
    FOR EACH ROW
    BEGIN
      UPDATE roadmaps
      SET updated_at = CURRENT_TIMESTAMP
      WHERE id = NEW.id;
    END;

    CREATE TRIGGER IF NOT EXISTS trg_roadmaps_alias_insert
    AFTER INSERT ON roadmaps
    FOR EACH ROW
    WHEN NEW.name IS NULL
      OR NEW.title IS NULL
      OR NEW.start_date IS NULL
      OR NEW.started_at IS NULL
      OR NEW.target_date IS NULL
      OR NEW.target_at IS NULL
      OR NEW.milestones IS NULL
    BEGIN
      UPDATE roadmaps
      SET
        name = COALESCE(NEW.name, NEW.title),
        title = COALESCE(NEW.title, NEW.name),
        start_date = COALESCE(NEW.start_date, NEW.started_at),
        started_at = COALESCE(NEW.started_at, NEW.start_date),
        target_date = COALESCE(NEW.target_date, NEW.target_at),
        target_at = COALESCE(NEW.target_at, NEW.target_date),
        milestones = COALESCE(NEW.milestones, '[]')
      WHERE id = NEW.id;
    END;

    CREATE TRIGGER IF NOT EXISTS trg_roadmaps_alias_update
    AFTER UPDATE ON roadmaps
    FOR EACH ROW
    WHEN COALESCE(NEW.name, '') != COALESCE(NEW.title, '')
      OR COALESCE(NEW.start_date, '') != COALESCE(NEW.started_at, '')
      OR COALESCE(NEW.target_date, '') != COALESCE(NEW.target_at, '')
      OR NEW.milestones IS NULL
    BEGIN
      UPDATE roadmaps
      SET
        name = COALESCE(NEW.name, NEW.title),
        title = COALESCE(NEW.title, NEW.name),
        start_date = COALESCE(NEW.start_date, NEW.started_at),
        started_at = COALESCE(NEW.started_at, NEW.start_date),
        target_date = COALESCE(NEW.target_date, NEW.target_at),
        target_at = COALESCE(NEW.target_at, NEW.target_date),
        milestones = COALESCE(NEW.milestones, '[]')
      WHERE id = NEW.id;
    END;
  `);

  db.exec('PRAGMA foreign_keys = ON');
}

function alignTasks(db) {
  addColumnIfMissing(
    db,
    'tasks',
    'quadrant',
    "quadrant TEXT CHECK (quadrant IS NULL OR quadrant IN ('urgent-important', 'not-urgent-important', 'urgent-not-important', 'not-urgent-not-important')) DEFAULT 'not-urgent-not-important'"
  );
  addColumnIfMissing(db, 'tasks', 'due_date', 'due_date DATETIME');
  addColumnIfMissing(db, 'tasks', 'roadmap_id', 'roadmap_id INTEGER');
  addColumnIfMissing(db, 'tasks', 'context_id', 'context_id INTEGER');
  addColumnIfMissing(db, 'tasks', 'tags', "tags TEXT DEFAULT '[]'");
  addColumnIfMissing(db, 'tasks', 'estimated_minutes', 'estimated_minutes INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing(db, 'tasks', 'actual_minutes', 'actual_minutes INTEGER NOT NULL DEFAULT 0');

  db.exec(`
    UPDATE tasks
    SET
      due_date = COALESCE(due_date, deadline_at),
      tags = COALESCE(tags, '[]'),
      estimated_minutes = COALESCE(estimated_minutes, 0),
      actual_minutes = COALESCE(actual_minutes, 0)
  `);

  db.exec(`
    DROP INDEX IF EXISTS idx_tasks_recently_updated;

    CREATE INDEX IF NOT EXISTS idx_tasks_roadmap
      ON tasks(roadmap_id, status, priority DESC)
      WHERE deleted_at IS NULL AND roadmap_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_tasks_context
      ON tasks(context_id, updated_at DESC)
      WHERE deleted_at IS NULL AND context_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_tasks_quadrant
      ON tasks(quadrant, status, priority DESC)
      WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_tasks_due_date_compat
      ON tasks(due_date, status)
      WHERE deleted_at IS NULL AND due_date IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_tasks_updated_active
      ON tasks(updated_at DESC, status)
      WHERE deleted_at IS NULL;

    DROP TRIGGER IF EXISTS trg_tasks_due_date_insert;
    DROP TRIGGER IF EXISTS trg_tasks_due_date_update;

    CREATE TRIGGER trg_tasks_due_date_insert
    AFTER INSERT ON tasks
    FOR EACH ROW
    WHEN (NEW.due_date IS NULL AND NEW.deadline_at IS NOT NULL)
      OR (NEW.deadline_at IS NULL AND NEW.due_date IS NOT NULL)
    BEGIN
      UPDATE tasks
      SET
        due_date = COALESCE(NEW.due_date, NEW.deadline_at),
        deadline_at = COALESCE(NEW.deadline_at, NEW.due_date)
      WHERE id = NEW.id;
    END;

    CREATE TRIGGER trg_tasks_due_date_update
    AFTER UPDATE OF due_date, deadline_at ON tasks
    FOR EACH ROW
    WHEN COALESCE(NEW.due_date, '') != COALESCE(NEW.deadline_at, '')
    BEGIN
      UPDATE tasks
      SET
        due_date = COALESCE(NEW.due_date, NEW.deadline_at),
        deadline_at = COALESCE(NEW.deadline_at, NEW.due_date)
      WHERE id = NEW.id;
    END;
  `);
}

function alignContexts(db) {
  addColumnIfMissing(db, 'contexts', 'state_data', "state_data TEXT NOT NULL DEFAULT '{}'");
  addColumnIfMissing(db, 'contexts', 'version', 'version INTEGER NOT NULL DEFAULT 1');
  addColumnIfMissing(db, 'contexts', 'checksum', 'checksum TEXT');
  addColumnIfMissing(db, 'contexts', 'size_bytes', 'size_bytes INTEGER NOT NULL DEFAULT 2');
  addColumnIfMissing(db, 'contexts', 'compressed', 'compressed BOOLEAN NOT NULL DEFAULT 0');
  addColumnIfMissing(db, 'contexts', 'created_by', 'created_by TEXT');
  addColumnIfMissing(db, 'contexts', 'expires_at', 'expires_at DATETIME');

  db.exec(`
    UPDATE contexts
    SET
      state_data = COALESCE(state_data, '{}'),
      version = COALESCE(version, 1),
      size_bytes = COALESCE(size_bytes, length(COALESCE(state_data, '{}'))),
      compressed = COALESCE(compressed, 0)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_contexts_created_by
      ON contexts(created_by, created_at DESC)
      WHERE deleted_at IS NULL AND created_by IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_contexts_expires_at
      ON contexts(expires_at, updated_at DESC)
      WHERE deleted_at IS NULL AND expires_at IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_contexts_type_updated
      ON contexts(context_type, updated_at DESC)
      WHERE deleted_at IS NULL;
  `);
}

function alignMerkle(db) {
  addColumnIfMissing(db, 'merkle_trees', 'name', 'name TEXT');
  addColumnIfMissing(db, 'merkle_trees', 'context_id', 'context_id INTEGER');
  addColumnIfMissing(db, 'merkle_trees', 'description', 'description TEXT');
  addColumnIfMissing(db, 'merkle_trees', 'updated_at', 'updated_at DATETIME DEFAULT CURRENT_TIMESTAMP');

  db.exec(`
    UPDATE merkle_trees
    SET
      name = COALESCE(name, tree_type),
      updated_at = COALESCE(updated_at, created_at)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_merkle_context
      ON merkle_trees(context_id, created_at DESC)
      WHERE context_id IS NOT NULL;

    DROP TRIGGER IF EXISTS trg_merkle_trees_updated_at;
    CREATE TRIGGER trg_merkle_trees_updated_at
    AFTER UPDATE ON merkle_trees
    FOR EACH ROW
    BEGIN
      UPDATE merkle_trees
      SET updated_at = CURRENT_TIMESTAMP
      WHERE id = NEW.id;
    END;
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS merkle_nodes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tree_id INTEGER NOT NULL,
      hash TEXT NOT NULL,
      left_child_id INTEGER,
      right_child_id INTEGER,
      parent_id INTEGER,
      leaf_index INTEGER,
      data_hash TEXT,
      node_type TEXT NOT NULL DEFAULT 'leaf' CHECK (node_type IN ('leaf', 'internal', 'root')),
      level INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (tree_id) REFERENCES merkle_trees(id) ON DELETE CASCADE,
      FOREIGN KEY (left_child_id) REFERENCES merkle_nodes(id) ON DELETE SET NULL,
      FOREIGN KEY (right_child_id) REFERENCES merkle_nodes(id) ON DELETE SET NULL,
      FOREIGN KEY (parent_id) REFERENCES merkle_nodes(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_merkle_nodes_tree_level
      ON merkle_nodes(tree_id, level, id);
    CREATE INDEX IF NOT EXISTS idx_merkle_nodes_parent
      ON merkle_nodes(parent_id, tree_id)
      WHERE parent_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_merkle_nodes_leaf
      ON merkle_nodes(tree_id, leaf_index)
      WHERE leaf_index IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_merkle_nodes_type
      ON merkle_nodes(tree_id, node_type, level);

    DROP TRIGGER IF EXISTS trg_merkle_nodes_updated_at;
    CREATE TRIGGER trg_merkle_nodes_updated_at
    AFTER UPDATE ON merkle_nodes
    FOR EACH ROW
    BEGIN
      UPDATE merkle_nodes
      SET updated_at = CURRENT_TIMESTAMP
      WHERE id = NEW.id;
    END;
  `);
}

export function up(db) {
  alignTasks(db);
  rebuildRoadmaps(db);
  alignContexts(db);
  alignMerkle(db);
}

export function down() {
  throw new Error('005_repository_contract_alignment is irreversible; restore from backup/checkpoint instead.');
}
