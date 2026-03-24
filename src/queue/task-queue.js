/**
 * @fileoverview Priority task queue with min-heap implementation and dynamic reprioritization.
 * @module queue/task-queue
 */

import { EventEmitter } from 'events';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('task-queue');

/**
 * Task priority levels.
 * Lower number = higher priority.
 * @readonly
 * @enum {number}
 */
export const Priority = {
  CRITICAL: 0,
  HIGH: 1,
  NORMAL: 2,
  LOW: 3,
  BACKGROUND: 4
};

/**
 * Task status values.
 * @readonly
 * @enum {string}
 */
export const TaskStatus = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled'
};

/**
 * @typedef {Object} Task
 * @property {string} id - Unique task identifier
 * @property {Function} execute - Task execution function
 * @property {number} priority - Task priority level
 * @property {number} enqueuedAt - Timestamp when task was enqueued
 * @property {string} status - Current task status
 * @property {*} [data] - Optional task data
 * @property {Object} [metadata] - Optional task metadata
 * @property {string} [tag] - Optional task tag for grouping
 */

/**
 * Min-heap implementation for O(log n) priority queue operations.
 * @private
 */
class MinHeap {
  constructor() {
    /** @type {Task[]} */
    this.heap = [];
    /** @type {Map<string, number>} */
    this.indexMap = new Map();
  }

  /**
   * Get parent index.
   * @param {number} i
   * @returns {number}
   */
  #parent(i) {
    return Math.floor((i - 1) / 2);
  }

  /**
   * Get left child index.
   * @param {number} i
   * @returns {number}
   */
  #leftChild(i) {
    return 2 * i + 1;
  }

  /**
   * Get right child index.
   * @param {number} i
   * @returns {number}
   */
  #rightChild(i) {
    return 2 * i + 2;
  }

  /**
   * Compare two tasks (lower priority number = higher priority).
   * Falls back to enqueue time (FIFO) for same priority.
   * @param {Task} a
   * @param {Task} b
   * @returns {number}
   */
  #compare(a, b) {
    if (a.priority !== b.priority) {
      return a.priority - b.priority;
    }
    if (a.sequence !== b.sequence) {
      return (a.sequence ?? 0) - (b.sequence ?? 0);
    }
    if (a.enqueuedAt !== b.enqueuedAt) {
      return a.enqueuedAt - b.enqueuedAt;
    }

    return a.id.localeCompare(b.id);
  }

  /**
   * Swap two elements in the heap and update index map.
   * @param {number} i
   * @param {number} j
   */
  #swap(i, j) {
    [this.heap[i], this.heap[j]] = [this.heap[j], this.heap[i]];
    this.indexMap.set(this.heap[i].id, i);
    this.indexMap.set(this.heap[j].id, j);
  }

  /**
   * Heapify up from index.
   * @param {number} i
   */
  #heapifyUp(i) {
    while (i > 0 && this.#compare(this.heap[i], this.heap[this.#parent(i)]) < 0) {
      const parent = this.#parent(i);
      this.#swap(i, parent);
      i = parent;
    }
  }

  /**
   * Heapify down from index.
   * @param {number} i
   */
  #heapifyDown(i) {
    const n = this.heap.length;
    for (;;) {
      let smallest = i;
      const left = this.#leftChild(i);
      const right = this.#rightChild(i);

      if (left < n && this.#compare(this.heap[left], this.heap[smallest]) < 0) {
        smallest = left;
      }
      if (right < n && this.#compare(this.heap[right], this.heap[smallest]) < 0) {
        smallest = right;
      }

      if (smallest === i) break;

      this.#swap(i, smallest);
      i = smallest;
    }
  }

  /**
   * Insert a task into the heap.
   * @param {Task} task
   */
  insert(task) {
    this.heap.push(task);
    const index = this.heap.length - 1;
    this.indexMap.set(task.id, index);
    this.#heapifyUp(index);
  }

  /**
   * Extract the minimum (highest priority) task.
   * @returns {Task|null}
   */
  extractMin() {
    if (this.heap.length === 0) return null;

    const min = this.heap[0];
    this.indexMap.delete(min.id);

    const last = this.heap.pop();
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.indexMap.set(last.id, 0);
      this.#heapifyDown(0);
    }

    return min;
  }

  /**
   * Peek at the minimum task without removing.
   * @returns {Task|null}
   */
  peek() {
    return this.heap.length > 0 ? this.heap[0] : null;
  }

  /**
   * Find task by id.
   * @param {string} taskId
   * @returns {Task|null}
   */
  find(taskId) {
    const index = this.indexMap.get(taskId);
    return index !== undefined ? this.heap[index] : null;
  }

  /**
   * Update task priority.
   * @param {string} taskId
   * @param {number} newPriority
   * @returns {boolean}
   */
  updatePriority(taskId, newPriority) {
    const index = this.indexMap.get(taskId);
    if (index === undefined) return false;

    const task = this.heap[index];
    const oldPriority = task.priority;
    task.priority = newPriority;

    if (newPriority < oldPriority) {
      this.#heapifyUp(index);
    } else if (newPriority > oldPriority) {
      this.#heapifyDown(index);
    }

    return true;
  }

  /**
   * Remove a task from the heap.
   * @param {string} taskId
   * @returns {Task|null}
   */
  remove(taskId) {
    const index = this.indexMap.get(taskId);
    if (index === undefined) return null;

    const removed = this.heap[index];
    this.indexMap.delete(taskId);

    const last = this.heap.pop();
    if (index < this.heap.length) {
      this.heap[index] = last;
      this.indexMap.set(last.id, index);
      
      // Restore heap property
      this.#heapifyUp(index);
      this.#heapifyDown(index);
    }

    return removed;
  }

  /**
   * Get heap size.
   * @returns {number}
   */
  get size() {
    return this.heap.length;
  }

  /**
   * Check if heap is empty.
   * @returns {boolean}
   */
  isEmpty() {
    return this.heap.length === 0;
  }

  /**
   * Get all tasks as array (for iteration).
   * @returns {Task[]}
   */
  toArray() {
    return [...this.heap];
  }
}

/**
 * Priority task queue with reprioritization support.
 * Extends EventEmitter for task lifecycle events.
 * @extends EventEmitter
 */
export class TaskQueue extends EventEmitter {
  /**
   * @param {Object} [options] - Queue options
   * @param {number} [options.maxSize=Infinity] - Maximum queue size
   * @param {boolean} [options.emitEvents=true] - Whether to emit events
   */
  constructor(options = {}) {
    super();
    this.heap = new MinHeap();
    this.maxSize = options.maxSize || Infinity;
    this.emitEvents = options.emitEvents !== false;
    this.enqueueSequence = 0;
    /** @type {Map<string, Task>} */
    this.taskMap = new Map();
    this.stats = {
      enqueued: 0,
      dequeued: 0,
      reprioritized: 0,
      removed: 0
    };
  }

  /**
   * Generate a unique task ID.
   * @returns {string}
   * @private
   */
  #generateId() {
    return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Enqueue a task with priority.
   * @param {Object} task - Task to enqueue
   * @param {string} [task.id] - Unique task identifier (auto-generated if not provided)
   * @param {Function} task.execute - Task execution function
   * @param {number} [priority=Priority.NORMAL] - Task priority
   * @param {*} [data] - Optional task data
   * @param {Object} [metadata] - Optional metadata
   * @param {string} [tag] - Optional task tag for grouping
   * @returns {Task} The enqueued task
   * @throws {Error} If queue is full or task ID already exists
   */
  enqueue(task, priority = Priority.NORMAL, data = null, metadata = {}, tag = null) {
    const taskId = task.id || this.#generateId();

    if (this.taskMap.has(taskId)) {
      throw new Error(`Task with id "${taskId}" already exists`);
    }

    if (this.heap.size >= this.maxSize) {
      throw new Error('Task queue is full');
    }

    const queueTask = {
      id: taskId,
      execute: task.execute,
      priority,
      enqueuedAt: Date.now(),
      sequence: this.enqueueSequence++,
      status: TaskStatus.PENDING,
      data,
      metadata: {
        ...metadata,
        enqueueCount: (metadata?.enqueueCount || 0) + 1,
        tag
      }
    };

    this.heap.insert(queueTask);
    this.taskMap.set(taskId, queueTask);
    this.stats.enqueued++;

    logger.debug(`Task enqueued: ${taskId} (priority: ${priority})`);
    
    if (this.emitEvents) {
      this.emit('task:enqueued', queueTask);
    }

    return queueTask;
  }

  /**
   * Dequeue the highest priority task.
   * @returns {Task|null} The dequeued task or null if queue is empty
   */
  dequeue() {
    const task = this.heap.extractMin();
    if (task) {
      this.taskMap.delete(task.id);
      task.status = TaskStatus.RUNNING;
      task.startedAt = Date.now();
      this.stats.dequeued++;

      logger.debug(`Task dequeued: ${task.id}`);
      
      if (this.emitEvents) {
        this.emit('task:started', task);
      }
    }
    return task;
  }

  /**
   * Peek at the highest priority task without removing.
   * @returns {Task|null}
   */
  peek() {
    return this.heap.peek();
  }

  /**
   * Reprioritize a task.
   * @param {string} taskId - Task identifier
   * @param {number} newPriority - New priority level
   * @returns {boolean} True if task was found and updated
   */
  reprioritize(taskId, newPriority) {
    const task = this.taskMap.get(taskId);
    if (!task) {
      logger.warn(`Cannot reprioritize: task ${taskId} not found`);
      return false;
    }

    const oldPriority = task.priority;
    const success = this.heap.updatePriority(taskId, newPriority);
    
    if (success) {
      task.metadata = { 
        ...task.metadata, 
        reprioritizedAt: Date.now(),
        oldPriority
      };
      this.stats.reprioritized++;

      logger.debug(`Task reprioritized: ${taskId} (${oldPriority} -> ${newPriority})`);
      
      if (this.emitEvents) {
        this.emit('task:reprioritized', { task, oldPriority, newPriority });
      }
    }
    
    return success;
  }

  /**
   * Remove a task from the queue.
   * @param {string} taskId - Task identifier
   * @returns {Task|null} The removed task or null if not found
   */
  remove(taskId) {
    const task = this.heap.remove(taskId);
    if (task) {
      this.taskMap.delete(taskId);
      task.status = TaskStatus.CANCELLED;
      task.cancelledAt = Date.now();
      this.stats.removed++;

      logger.debug(`Task removed: ${taskId}`);
      
      if (this.emitEvents) {
        this.emit('task:cancelled', task);
      }
    }
    return task;
  }

  /**
   * Get the current queue size.
   * @returns {number}
   */
  size() {
    return this.heap.size;
  }

  /**
   * Check if task exists in queue.
   * @param {string} taskId
   * @returns {boolean}
   */
  has(taskId) {
    return this.taskMap.has(taskId);
  }

  /**
   * Get task by id.
   * @param {string} taskId
   * @returns {Task|null}
   */
  get(taskId) {
    return this.taskMap.get(taskId) || null;
  }

  /**
   * Check if queue is empty.
   * @returns {boolean}
   */
  isEmpty() {
    return this.heap.isEmpty();
  }

  /**
   * Check if queue is full.
   * @returns {boolean}
   */
  isFull() {
    return this.heap.size >= this.maxSize;
  }

  /**
   * Clear all tasks from queue.
   * @param {boolean} [cancelTasks=true] - Whether to mark tasks as cancelled
   * @returns {number} Number of tasks cleared
   */
  clear(cancelTasks = true) {
    const count = this.heap.size;
    
    if (cancelTasks && this.emitEvents) {
      for (const task of this.taskMap.values()) {
        task.status = TaskStatus.CANCELLED;
        this.emit('task:cancelled', task);
      }
    }
    
    this.heap = new MinHeap();
    this.taskMap.clear();
    
    logger.debug(`Queue cleared: ${count} tasks removed`);
    
    if (this.emitEvents) {
      this.emit('queue:cleared', { count });
    }
    
    return count;
  }

  /**
   * Get queue statistics.
   * @returns {Object}
   */
  getStats() {
    return { 
      ...this.stats,
      currentSize: this.heap.size,
      maxSize: this.maxSize,
      isFull: this.isFull()
    };
  }

  /**
   * Get all tasks sorted by priority.
   * @returns {Task[]}
   */
  toArray() {
    const tasks = [];
    const tempHeap = new MinHeap();
    
    // Copy all tasks
    for (const task of this.taskMap.values()) {
      tempHeap.insert({ ...task });
    }

    // Extract in priority order
    while (!tempHeap.isEmpty()) {
      tasks.push(tempHeap.extractMin());
    }

    return tasks;
  }

  /**
   * Get tasks by tag.
   * @param {string} tag
   * @returns {Task[]}
   */
  getByTag(tag) {
    return this.toArray().filter(task => task.metadata?.tag === tag);
  }

  /**
   * Get tasks by status.
   * @param {string} status
   * @returns {Task[]}
   */
  getByStatus(status) {
    return this.toArray().filter(task => task.status === status);
  }

  /**
   * Update task status.
   * @param {string} taskId
   * @param {string} status
   * @param {Object} [extra] - Additional data to update
   * @returns {boolean}
   */
  updateStatus(taskId, status, extra = {}) {
    const task = this.taskMap.get(taskId);
    if (!task) return false;

    task.status = status;
    Object.assign(task, extra);

    if (this.emitEvents) {
      this.emit(`task:${status}`, task);
    }

    return true;
  }
}

export default TaskQueue;
