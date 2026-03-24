/**
 * CogniMesh v5.0 - Additional performance indexes aligned with the live schema
 * Adds secondary indexes for common access patterns on the core tables created
 * in 001_initial_schema.js and the metadata table introduced in 002_add_indexes.js.
 */

const INDEX_METADATA = [
  ['idx_users_session_lookup', 'users', 'composite', '{"purpose":"session lookup"}'],
  ['idx_users_email_status', 'users', 'composite', '{"purpose":"email search"}'],
  ['idx_tasks_completion_stats', 'tasks', 'partial', '{"purpose":"completion stats"}'],
  ['idx_tasks_type_date', 'tasks', 'composite', '{"purpose":"task reporting"}'],
  ['idx_tasks_parent_ordered', 'tasks', 'composite', '{"purpose":"task hierarchy"}'],
  ['idx_tasks_deadline_window', 'tasks', 'partial', '{"purpose":"deadline scheduling"}'],
  ['idx_roadmaps_list_view', 'roadmaps', 'covering', '{"purpose":"roadmap list"}'],
  ['idx_roadmaps_visibility', 'roadmaps', 'partial', '{"purpose":"roadmap visibility"}'],
  ['idx_nodes_hierarchy', 'roadmap_nodes', 'composite', '{"purpose":"node hierarchy"}'],
  ['idx_nodes_by_type', 'roadmap_nodes', 'composite', '{"purpose":"node filtering"}'],
  ['idx_nodes_completed', 'roadmap_nodes', 'partial', '{"purpose":"node timeline"}'],
  ['idx_contexts_recent', 'contexts', 'composite', '{"purpose":"recent contexts"}'],
  ['idx_contexts_owner_type', 'contexts', 'composite', '{"purpose":"owner grouping"}'],
  ['idx_conversations_summary', 'conversations', 'covering', '{"purpose":"conversation summary"}'],
  ['idx_conversations_creator_recent', 'conversations', 'composite', '{"purpose":"creator activity"}'],
  ['idx_messages_sender_recent', 'messages', 'composite', '{"purpose":"sender lookup"}'],
  ['idx_messages_recent', 'messages', 'composite', '{"purpose":"recent messages"}'],
  ['idx_messages_thread', 'messages', 'partial', '{"purpose":"message threading"}'],
  ['idx_messages_attachments', 'messages', 'partial', '{"purpose":"attachment filter"}'],
  ['idx_analytics_hourly', 'analytics', 'composite', '{"purpose":"hourly aggregation"}'],
  ['idx_analytics_daily', 'analytics', 'partial', '{"purpose":"daily rollups"}'],
  ['idx_analytics_entity_recent', 'analytics', 'composite', '{"purpose":"entity metrics"}'],
  ['idx_audit_action_time', 'audit_logs', 'composite', '{"purpose":"action lookup"}'],
  ['idx_audit_entity_changes', 'audit_logs', 'composite', '{"purpose":"change history"}'],
  ['idx_audit_user_timeline', 'audit_logs', 'composite', '{"purpose":"user activity"}'],
  ['idx_audit_ip', 'audit_logs', 'partial', '{"purpose":"IP tracking"}'],
  ['idx_batches_status_created', 'batches', 'composite', '{"purpose":"batch queue"}'],
  ['idx_batches_creator_recent', 'batches', 'composite', '{"purpose":"batch ownership"}'],
  ['idx_alerts_inbox', 'alerts', 'composite', '{"purpose":"alert inbox"}'],
  ['idx_alerts_source_recent', 'alerts', 'composite', '{"purpose":"alert source"}'],
  ['idx_alerts_expiry_active', 'alerts', 'partial', '{"purpose":"expiry cleanup"}'],
  ['idx_merkle_entity_recent', 'merkle_trees', 'composite', '{"purpose":"tree lookup"}'],
  ['idx_merkle_leaves_tree_order', 'merkle_leaves', 'composite', '{"purpose":"leaf traversal"}'],
  ['idx_merkle_leaves_data_hash', 'merkle_leaves', 'composite', '{"purpose":"leaf verification"}']
];

/**
 * Apply additional performance indexes
 * @param {import('better-sqlite3').Database} db
 */
export function up(db) {
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_users_session_lookup
      ON users(uuid, status, role)
      WHERE deleted_at IS NULL;

    CREATE INDEX IF NOT EXISTS idx_users_email_status
      ON users(email, status)
      WHERE deleted_at IS NULL;

    CREATE INDEX IF NOT EXISTS idx_tasks_completion_stats
      ON tasks(assignee_id, status, completed_at DESC)
      WHERE deleted_at IS NULL AND status = 'completed';

    CREATE INDEX IF NOT EXISTS idx_tasks_type_date
      ON tasks(task_type, created_at DESC)
      WHERE deleted_at IS NULL;

    CREATE INDEX IF NOT EXISTS idx_tasks_parent_ordered
      ON tasks(parent_id, priority DESC, created_at)
      WHERE deleted_at IS NULL AND parent_id IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_tasks_deadline_window
      ON tasks(deadline_at, status, priority DESC)
      WHERE deleted_at IS NULL
        AND deadline_at IS NOT NULL
        AND status NOT IN ('completed', 'cancelled', 'failed');

    CREATE INDEX IF NOT EXISTS idx_roadmaps_list_view
      ON roadmaps(owner_id, status, updated_at DESC, title, uuid)
      WHERE deleted_at IS NULL;

    CREATE INDEX IF NOT EXISTS idx_roadmaps_visibility
      ON roadmaps(status, visibility, updated_at DESC)
      WHERE deleted_at IS NULL AND visibility IN ('public', 'shared');

    CREATE INDEX IF NOT EXISTS idx_nodes_hierarchy
      ON roadmap_nodes(roadmap_id, parent_id, status, node_type)
      WHERE deleted_at IS NULL;

    CREATE INDEX IF NOT EXISTS idx_nodes_by_type
      ON roadmap_nodes(roadmap_id, node_type, status, updated_at DESC)
      WHERE deleted_at IS NULL;

    CREATE INDEX IF NOT EXISTS idx_nodes_completed
      ON roadmap_nodes(roadmap_id, completed_at DESC)
      WHERE deleted_at IS NULL AND completed_at IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_contexts_recent
      ON contexts(owner_id, last_accessed_at DESC, updated_at DESC)
      WHERE deleted_at IS NULL;

    CREATE INDEX IF NOT EXISTS idx_contexts_owner_type
      ON contexts(owner_id, context_type, updated_at DESC)
      WHERE deleted_at IS NULL;

    CREATE INDEX IF NOT EXISTS idx_conversations_summary
      ON conversations(context_id, status, last_message_at DESC, title)
      WHERE deleted_at IS NULL;

    CREATE INDEX IF NOT EXISTS idx_conversations_creator_recent
      ON conversations(creator_id, status, last_message_at DESC)
      WHERE deleted_at IS NULL;

    CREATE INDEX IF NOT EXISTS idx_messages_sender_recent
      ON messages(conversation_id, sender_id, sent_at DESC)
      WHERE is_deleted = 0;

    CREATE INDEX IF NOT EXISTS idx_messages_recent
      ON messages(conversation_id, sent_at DESC, id)
      WHERE is_deleted = 0;

    CREATE INDEX IF NOT EXISTS idx_messages_thread
      ON messages(parent_id, sent_at)
      WHERE is_deleted = 0 AND parent_id IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_messages_attachments
      ON messages(conversation_id, sent_at DESC)
      WHERE is_deleted = 0 AND attachments IS NOT NULL AND attachments != '[]';

    CREATE INDEX IF NOT EXISTS idx_analytics_hourly
      ON analytics(metric_name, bucket_date, bucket_hour, recorded_at DESC)
      WHERE sampled = 0;

    CREATE INDEX IF NOT EXISTS idx_analytics_daily
      ON analytics(metric_name, bucket_date, recorded_at DESC)
      WHERE sampled = 0 AND bucket_hour IS NULL;

    CREATE INDEX IF NOT EXISTS idx_analytics_entity_recent
      ON analytics(metric_name, entity_type, entity_id, recorded_at DESC)
      WHERE sampled = 0 AND entity_id IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_audit_action_time
      ON audit_logs(action, entity_type, timestamp DESC);

    CREATE INDEX IF NOT EXISTS idx_audit_entity_changes
      ON audit_logs(entity_type, entity_id, action, timestamp DESC);

    CREATE INDEX IF NOT EXISTS idx_audit_user_timeline
      ON audit_logs(user_id, timestamp DESC, action);

    CREATE INDEX IF NOT EXISTS idx_audit_ip
      ON audit_logs(ip_address, timestamp DESC)
      WHERE ip_address IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_batches_status_created
      ON batches(status, batch_type, created_at DESC)
      WHERE deleted_at IS NULL;

    CREATE INDEX IF NOT EXISTS idx_batches_creator_recent
      ON batches(created_by, status, created_at DESC)
      WHERE deleted_at IS NULL AND created_by IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_alerts_inbox
      ON alerts(status, severity DESC, created_at DESC)
      WHERE deleted_at IS NULL;

    CREATE INDEX IF NOT EXISTS idx_alerts_source_recent
      ON alerts(source, source_id, created_at DESC)
      WHERE deleted_at IS NULL AND source IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_alerts_expiry_active
      ON alerts(expires_at)
      WHERE expires_at IS NOT NULL AND status IN ('unread', 'read');

    CREATE INDEX IF NOT EXISTS idx_merkle_entity_recent
      ON merkle_trees(entity_type, entity_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_merkle_leaves_tree_order
      ON merkle_leaves(tree_id, leaf_index, created_at);

    CREATE INDEX IF NOT EXISTS idx_merkle_leaves_data_hash
      ON merkle_leaves(tree_id, data_hash);
  `);

  const insertStat = db.prepare(`
    INSERT OR IGNORE INTO index_statistics (index_name, table_name, index_type, created_at, metadata)
    VALUES (?, ?, ?, datetime('now'), ?)
  `);

  const recordStats = db.transaction(() => {
    for (const [indexName, tableName, indexType, metadata] of INDEX_METADATA) {
      insertStat.run(indexName, tableName, indexType, metadata);
    }
  });

  recordStats();
  db.exec('ANALYZE');
}

/**
 * Rollback additional performance indexes
 * @param {import('better-sqlite3').Database} db
 */
export function down(db) {
  for (const [indexName] of INDEX_METADATA) {
    db.exec(`DROP INDEX IF EXISTS ${indexName}`);
  }

  const deleteStat = db.prepare(`
    DELETE FROM index_statistics
    WHERE index_name = ?
  `);

  const removeStats = db.transaction(() => {
    for (const [indexName] of INDEX_METADATA) {
      deleteStat.run(indexName);
    }
  });

  removeStats();
}
