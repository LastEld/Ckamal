/**
 * @fileoverview Document Versioning Schema Migration
 * Creates tables for document management with full version history.
 * Inspired by Paperclip's document system.
 * @module db/migrations/011_document_versioning
 */

/**
 * Apply document versioning schema
 * @param {import('better-sqlite3').Database} db
 */
export function up(db) {
  db.exec(`
    -- ============================================
    -- DOCUMENTS - Main document records
    -- ============================================
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      company_id TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      format TEXT NOT NULL DEFAULT 'markdown' CHECK (format IN ('markdown', 'text', 'html', 'json', 'yaml')),
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'deleted')),
      visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'shared', 'public')),
      current_version INTEGER NOT NULL DEFAULT 1,
      latest_revision_id TEXT,
      word_count INTEGER DEFAULT 0,
      char_count INTEGER DEFAULT 0,
      tags TEXT DEFAULT '[]',
      metadata TEXT DEFAULT '{}',
      created_by TEXT,
      updated_by TEXT,
      deleted_by TEXT,
      deleted_at DATETIME,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES auth_users(id) ON DELETE SET NULL,
      FOREIGN KEY (updated_by) REFERENCES auth_users(id) ON DELETE SET NULL,
      FOREIGN KEY (deleted_by) REFERENCES auth_users(id) ON DELETE SET NULL
      -- Note: latest_revision_id foreign key omitted to avoid forward reference
      -- Referential integrity should be enforced at application level
    );

    CREATE INDEX IF NOT EXISTS idx_documents_company ON documents(company_id) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_documents_visibility ON documents(visibility) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_documents_updated ON documents(company_id, updated_at DESC) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_documents_created ON documents(company_id, created_at DESC) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_documents_title ON documents(title) WHERE deleted_at IS NULL;

    -- Full-text search index for documents
    CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
      title,
      content,
      content_rowid=rowid,
      content='documents'
    );

    -- ============================================
    -- DOCUMENT_REVISIONS - Version history
    -- ============================================
    CREATE TABLE IF NOT EXISTS document_revisions (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      document_id TEXT NOT NULL,
      version_number INTEGER NOT NULL,
      content TEXT NOT NULL,
      title TEXT NOT NULL,
      change_summary TEXT,
      word_count INTEGER DEFAULT 0,
      char_count INTEGER DEFAULT 0,
      author TEXT NOT NULL,
      author_type TEXT NOT NULL DEFAULT 'user' CHECK (author_type IN ('user', 'agent', 'system')),
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
      FOREIGN KEY (author) REFERENCES auth_users(id) ON DELETE SET NULL,
      UNIQUE(document_id, version_number)
    );

    CREATE INDEX IF NOT EXISTS idx_revisions_document ON document_revisions(document_id, version_number DESC);
    CREATE INDEX IF NOT EXISTS idx_revisions_author ON document_revisions(author);
    CREATE INDEX IF NOT EXISTS idx_revisions_created ON document_revisions(created_at);

    -- ============================================
    -- DOCUMENT_SHARES - Cross-company sharing
    -- ============================================
    CREATE TABLE IF NOT EXISTS document_shares (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      document_id TEXT NOT NULL,
      source_company_id TEXT NOT NULL,
      target_company_id TEXT NOT NULL,
      permission TEXT NOT NULL DEFAULT 'read' CHECK (permission IN ('read', 'write', 'admin')),
      shared_by TEXT NOT NULL,
      share_token TEXT UNIQUE,
      expires_at DATETIME,
      revoked_at DATETIME,
      revoked_by TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
      FOREIGN KEY (source_company_id) REFERENCES companies(id) ON DELETE CASCADE,
      FOREIGN KEY (target_company_id) REFERENCES companies(id) ON DELETE CASCADE,
      FOREIGN KEY (shared_by) REFERENCES auth_users(id) ON DELETE SET NULL,
      FOREIGN KEY (revoked_by) REFERENCES auth_users(id) ON DELETE SET NULL,
      UNIQUE(document_id, target_company_id)
    );

    CREATE INDEX IF NOT EXISTS idx_shares_document ON document_shares(document_id);
    CREATE INDEX IF NOT EXISTS idx_shares_source ON document_shares(source_company_id);
    CREATE INDEX IF NOT EXISTS idx_shares_target ON document_shares(target_company_id);
    CREATE INDEX IF NOT EXISTS idx_shares_token ON document_shares(share_token) WHERE revoked_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_shares_active ON document_shares(target_company_id, revoked_at) WHERE revoked_at IS NULL;

    -- ============================================
    -- DOCUMENT_SUBSCRIPTIONS - User subscriptions to documents
    -- ============================================
    CREATE TABLE IF NOT EXISTS document_subscriptions (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      document_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      subscription_type TEXT NOT NULL DEFAULT 'watch' CHECK (subscription_type IN ('watch', 'notify', 'ignore')),
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE,
      UNIQUE(document_id, user_id)
    );

    CREATE INDEX IF NOT EXISTS idx_subscriptions_document ON document_subscriptions(document_id);
    CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON document_subscriptions(user_id);

    -- ============================================
    -- Update triggers
    -- ============================================
    CREATE TRIGGER IF NOT EXISTS trg_documents_updated_at
    AFTER UPDATE ON documents
    FOR EACH ROW
    BEGIN
      UPDATE documents SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

    -- FTS triggers for keeping search index in sync
    CREATE TRIGGER IF NOT EXISTS trg_documents_fts_insert
    AFTER INSERT ON documents
    BEGIN
      INSERT INTO documents_fts(rowid, title, content)
      VALUES (NEW.rowid, NEW.title, NEW.content);
    END;

    CREATE TRIGGER IF NOT EXISTS trg_documents_fts_update
    AFTER UPDATE ON documents
    BEGIN
      UPDATE documents_fts SET title = NEW.title, content = NEW.content
      WHERE rowid = NEW.rowid;
    END;

    CREATE TRIGGER IF NOT EXISTS trg_documents_fts_delete
    AFTER DELETE ON documents
    BEGIN
      DELETE FROM documents_fts WHERE rowid = OLD.rowid;
    END;
  `);
}

/**
 * Rollback document versioning schema
 * @param {import('better-sqlite3').Database} db
 */
export function down(db) {
  db.exec(`
    DROP TRIGGER IF EXISTS trg_documents_fts_delete;
    DROP TRIGGER IF EXISTS trg_documents_fts_update;
    DROP TRIGGER IF EXISTS trg_documents_fts_insert;
    DROP TRIGGER IF EXISTS trg_documents_updated_at;

    DROP TABLE IF EXISTS document_subscriptions;
    DROP TABLE IF EXISTS document_shares;
    DROP TABLE IF EXISTS document_revisions;
    DROP TABLE IF EXISTS documents_fts;
    DROP TABLE IF EXISTS documents;
  `);
}
