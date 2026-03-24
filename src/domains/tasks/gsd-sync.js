/**
 * @fileoverview GSD (Getting Stuff Done) Synchronization
 * @module domains/tasks/gsd-sync
 */

/**
 * GSD task format
 * @typedef {Object} GSDTask
 * @property {string} id - GSD system task ID
 * @property {string} title - Task title
 * @property {string} [description] - Task description
 * @property {string} status - GSD status (inbox, next, waiting, scheduled, someday, done)
 * @property {string} [project] - Associated project
 * @property {string[]} [contexts] - GTD-style contexts
 * @property {string} [dueDate] - Due date
 * @property {number} [energy] - Energy level required (1-5)
 * @property {number} [time] - Time required in minutes
 * @property {string} [priority] - Priority
 * @property {string[]} [tags] - Tags
 * @property {string} [source] - Source system
 * @property {string} modifiedAt - Last modification timestamp
 */

/**
 * Sync operation result
 * @typedef {Object} SyncResult
 * @property {number} imported - Number of tasks imported
 * @property {number} exported - Number of tasks exported
 * @property {number} conflicts - Number of conflicts detected
 * @property {string[]} errors - Error messages
 * @property {string} syncedAt - Sync timestamp
 */

/**
 * Conflict resolution
 * @typedef {Object} ConflictResolution
 * @property {string} localTaskId - Local task ID
 * @property {string} remoteTaskId - Remote task ID
 * @property {'local' | 'remote' | 'merge'} resolution - Resolution strategy
 * @property {Object} mergedData - Merged data if resolution is 'merge'
 */

/**
 * GSD synchronization adapter for external task systems
 */
export class GSDSync {
  /**
   * @private
   * @type {Object}
   */
  #adapter;

  /**
   * @private
   * @type {Map<string, string>}
   */
  #idMapping;

  /**
   * @private
   * @type {string}
   */
  #lastSync;

  /**
   * Creates a new GSDSync instance
   * @param {Object} adapter - External system adapter
   * @param {function(): Promise<GSDTask[]>} adapter.fetchRemote - Fetch remote tasks
   * @param {function(GSDTask): Promise<GSDTask>} adapter.pushRemote - Push task to remote
   * @param {function(string): Promise<boolean>} adapter.deleteRemote - Delete remote task
   * @param {function(string, string): Promise<GSDTask>} adapter.updateRemote - Update remote task
   */
  constructor(adapter) {
    if (!adapter) {
      throw new Error('Adapter is required');
    }

    this.#adapter = adapter;
    this.#idMapping = new Map();
    this.#lastSync = null;
  }

  /**
   * Map GSD status to internal status
   * @private
   * @param {string} gsdStatus - GSD status
   * @returns {string} Internal status
   */
  #mapStatusFromGSD(gsdStatus) {
    const statusMap = {
      'inbox': 'backlog',
      'next': 'todo',
      'waiting': 'in_progress',
      'scheduled': 'todo',
      'someday': 'backlog',
      'done': 'done'
    };
    return statusMap[gsdStatus] ?? 'backlog';
  }

  /**
   * Map internal status to GSD status
   * @private
   * @param {string} internalStatus - Internal status
   * @param {boolean} [isScheduled] - Whether task is scheduled
   * @returns {string} GSD status
   */
  #mapStatusToGSD(internalStatus, isScheduled = false) {
    if (isScheduled) return 'scheduled';
    
    const statusMap = {
      'backlog': 'inbox',
      'todo': 'next',
      'in_progress': 'waiting',
      'review': 'waiting',
      'done': 'done',
      'archived': 'done'
    };
    return statusMap[internalStatus] ?? 'inbox';
  }

  /**
   * Map GSD task to internal format
   * @private
   * @param {GSDTask} gsdTask - GSD task
   * @returns {Object} Internal task format
   */
  #mapFromGSD(gsdTask) {
    return {
      externalId: gsdTask.id,
      title: gsdTask.title,
      description: gsdTask.description ?? '',
      status: this.#mapStatusFromGSD(gsdTask.status),
      priority: this.#mapPriorityFromGSD(gsdTask.priority),
      dueDate: gsdTask.dueDate ?? null,
      estimatedMinutes: gsdTask.time ?? 0,
      tags: [
        ...(gsdTask.contexts ?? []),
        ...(gsdTask.project ? [`project:${gsdTask.project}`] : []),
        ...(gsdTask.tags ?? [])
      ],
      externalSource: gsdTask.source ?? 'gsd',
      externalModifiedAt: gsdTask.modifiedAt
    };
  }

  /**
   * Map internal task to GSD format
   * @private
   * @param {Object} internalTask - Internal task
   * @param {boolean} [isScheduled] - Whether scheduled
   * @returns {GSDTask} GSD task
   */
  #mapToGSD(internalTask, isScheduled = false) {
    const contexts = internalTask.tags?.filter(t => !t.includes(':')) ?? [];
    const projectTag = internalTask.tags?.find(t => t.startsWith('project:'));
    const project = projectTag ? projectTag.replace('project:', '') : undefined;

    return {
      id: this.#idMapping.get(internalTask.id),
      title: internalTask.title,
      description: internalTask.description,
      status: this.#mapStatusToGSD(internalTask.status, isScheduled),
      project,
      contexts,
      dueDate: internalTask.dueDate,
      time: internalTask.estimatedMinutes,
      priority: this.#mapPriorityToGSD(internalTask.priority),
      tags: internalTask.tags?.filter(t => !t.startsWith('project:')) ?? [],
      modifiedAt: new Date().toISOString()
    };
  }

  /**
   * Map priority from GSD
   * @private
   * @param {string} [gsdPriority] - GSD priority
   * @returns {string}
   */
  #mapPriorityFromGSD(gsdPriority) {
    const priorityMap = {
      'highest': 'critical',
      'high': 'high',
      'medium': 'medium',
      'low': 'low',
      'lowest': 'low'
    };
    return priorityMap[gsdPriority] ?? 'medium';
  }

  /**
   * Map priority to GSD
   * @private
   * @param {string} [internalPriority] - Internal priority
   * @returns {string}
   */
  #mapPriorityToGSD(internalPriority) {
    const priorityMap = {
      'critical': 'highest',
      'high': 'high',
      'medium': 'medium',
      'low': 'low'
    };
    return priorityMap[internalPriority] ?? 'medium';
  }

  /**
   * Perform bidirectional sync
   * @param {Object} options - Sync options
   * @param {Object[]} [options.localTasks] - Local tasks to sync
   * @param {ConflictResolution[]} [options.conflictResolutions] - Pre-defined resolutions
   * @param {boolean} [options.autoResolve=false] - Auto-resolve conflicts
   * @returns {Promise<SyncResult>} Sync result
   */
  async sync(options = {}) {
    const result = {
      imported: 0,
      exported: 0,
      conflicts: 0,
      errors: [],
      syncedAt: new Date().toISOString()
    };

    try {
      // Fetch remote tasks
      const remoteTasks = await this.#adapter.fetchRemote();
      
      // Build remote task lookup
      const remoteById = new Map(remoteTasks.map(t => [t.id, t]));
      
      // Process local tasks
      const localTasks = options.localTasks ?? [];
      
      for (const localTask of localTasks) {
        try {
          const remoteId = this.#idMapping.get(localTask.id);
          
          if (remoteId && remoteById.has(remoteId)) {
            // Task exists in both - check for conflicts
            const remoteTask = remoteById.get(remoteId);
            const conflict = this.#detectConflict(localTask, remoteTask);
            
            if (conflict) {
              result.conflicts++;
              
              if (options.autoResolve) {
                await this.#resolveConflict(localTask, remoteTask, { resolution: 'merge' });
              }
            } else {
              // No conflict, update remote
              await this.#adapter.updateRemote(remoteId, this.#mapToGSD(localTask));
              result.exported++;
            }
          } else {
            // New local task - push to remote
            const newRemote = await this.#adapter.pushRemote(this.#mapToGSD(localTask));
            this.#idMapping.set(localTask.id, newRemote.id);
            result.exported++;
          }
        } catch (error) {
          result.errors.push(`Export failed for ${localTask.id}: ${error.message}`);
        }
      }

      // Process remote tasks not in local
      for (const remoteTask of remoteTasks) {
        const hasLocalMapping = Array.from(this.#idMapping.values()).includes(remoteTask.id);
        
        if (!hasLocalMapping) {
          try {
            // New remote task
            result.imported++;
          } catch (error) {
            result.errors.push(`Import failed for ${remoteTask.id}: ${error.message}`);
          }
        }
      }

      this.#lastSync = result.syncedAt;
    } catch (error) {
      result.errors.push(`Sync failed: ${error.message}`);
    }

    return result;
  }

  /**
   * Detect conflict between local and remote
   * @private
   * @param {Object} localTask - Local task
   * @param {GSDTask} remoteTask - Remote task
   * @returns {boolean} True if conflict detected
   */
  #detectConflict(localTask, remoteTask) {
    const localModified = new Date(localTask.updatedAt);
    const remoteModified = new Date(remoteTask.modifiedAt);
    
    // If both modified since last sync, it's a conflict
    if (this.#lastSync) {
      const lastSyncTime = new Date(this.#lastSync);
      return localModified > lastSyncTime && remoteModified > lastSyncTime;
    }
    
    return false;
  }

  /**
   * Resolve a conflict
   * @private
   * @param {Object} localTask - Local task
   * @param {GSDTask} remoteTask - Remote task
   * @param {ConflictResolution} resolution - Resolution strategy
   * @returns {Promise<Object>} Resolved task
   */
  async #resolveConflict(localTask, remoteTask, resolution) {
    switch (resolution.resolution) {
      case 'local':
        await this.#adapter.updateRemote(remoteTask.id, this.#mapToGSD(localTask));
        return localTask;
      
      case 'remote':
        return this.#mapFromGSD(remoteTask);
      
      case 'merge':
      default: {
        const merged = {
          ...localTask,
          ...this.#mapFromGSD(remoteTask),
          title: localTask.title || remoteTask.title,
          description: localTask.description || remoteTask.description,
          // Keep the most recent due date
          dueDate: localTask.dueDate || remoteTask.dueDate,
          // Merge tags
          tags: [...new Set([...(localTask.tags ?? []), ...(remoteTask.tags ?? [])])]
        };
        await this.#adapter.updateRemote(remoteTask.id, this.#mapToGSD(merged));
        return merged;
      }
    }
  }

  /**
   * Import tasks from GSD system
   * @returns {Promise<Object[]>} Imported tasks in internal format
   */
  async importFromGSD() {
    const remoteTasks = await this.#adapter.fetchRemote();
    return remoteTasks.map(task => this.#mapFromGSD(task));
  }

  /**
   * Export tasks to GSD system
   * @param {Object[]} tasks - Tasks to export
   * @returns {Promise<GSDTask[]>} Exported tasks
   */
  async exportToGSD(tasks) {
    const exported = [];
    
    for (const task of tasks) {
      const gsdTask = this.#mapToGSD(task);
      const result = await this.#adapter.pushRemote(gsdTask);
      this.#idMapping.set(task.id, result.id);
      exported.push(result);
    }
    
    return exported;
  }

  /**
   * Get ID mapping
   * @returns {Object.<string, string>} Local to remote ID mapping
   */
  getIdMapping() {
    return Object.fromEntries(this.#idMapping);
  }

  /**
   * Set ID mapping
   * @param {Object.<string, string>} mapping - ID mapping
   */
  setIdMapping(mapping) {
    this.#idMapping = new Map(Object.entries(mapping));
  }

  /**
   * Get last sync timestamp
   * @returns {string|null}
   */
  getLastSync() {
    return this.#lastSync;
  }
}

/**
 * Mock GSD adapter for testing
 */
export class MockGSDAdapter {
  /**
   * @private
   * @type {Map<string, GSDTask>}
   */
  #tasks = new Map();

  /**
   * Add a mock task
   * @param {GSDTask} task - Task to add
   */
  addMockTask(task) {
    this.#tasks.set(task.id, task);
  }

  /**
   * Fetch remote tasks
   * @returns {Promise<GSDTask[]>}
   */
  async fetchRemote() {
    return Array.from(this.#tasks.values());
  }

  /**
   * Push task to remote
   * @param {GSDTask} task - Task to push
   * @returns {Promise<GSDTask>}
   */
  async pushRemote(task) {
    const id = `gsd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newTask = { ...task, id };
    this.#tasks.set(id, newTask);
    return newTask;
  }

  /**
   * Delete remote task
   * @param {string} id - Task ID
   * @returns {Promise<boolean>}
   */
  async deleteRemote(id) {
    return this.#tasks.delete(id);
  }

  /**
   * Update remote task
   * @param {string} id - Task ID
   * @param {GSDTask} data - Update data
   * @returns {Promise<GSDTask>}
   */
  async updateRemote(id, data) {
    const task = { ...this.#tasks.get(id), ...data, id };
    this.#tasks.set(id, task);
    return task;
  }

  /**
   * Clear all mock tasks
   */
  clear() {
    this.#tasks.clear();
  }
}

export default GSDSync;
