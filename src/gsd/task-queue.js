/**
 * @fileoverview Priority task queue with reprioritization support.
 * @module gsd/task-queue
 */

/**
 * Task priority levels.
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
 * Represents a task in the queue.
 * @typedef {Object} Task
 * @property {string} id - Unique task identifier
 * @property {Function} execute - Task execution function
 * @property {number} priority - Task priority level
 * @property {number} enqueuedAt - Timestamp when task was enqueued
 * @property {*} [data] - Optional task data
 * @property {Object} [metadata] - Optional task metadata
 */

/**
 * Min-heap implementation for priority queue.
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
  parent(i) {
    return Math.floor((i - 1) / 2);
  }

  /**
   * Get left child index.
   * @param {number} i
   * @returns {number}
   */
  leftChild(i) {
    return 2 * i + 1;
  }

  /**
   * Get right child index.
   * @param {number} i
   * @returns {number}
   */
  rightChild(i) {
    return 2 * i + 2;
  }

  /**
   * Compare two tasks (lower priority number = higher priority).
   * @param {Task} a
   * @param {Task} b
   * @returns {number}
   */
  compare(a, b) {
    if (a.priority !== b.priority) {
      return a.priority - b.priority;
    }
    return a.enqueuedAt - b.enqueuedAt;
  }

  /**
   * Swap two elements in the heap.
   * @param {number} i
   * @param {number} j
   */
  swap(i, j) {
    [this.heap[i], this.heap[j]] = [this.heap[j], this.heap[i]];
    this.indexMap.set(this.heap[i].id, i);
    this.indexMap.set(this.heap[j].id, j);
  }

  /**
   * Heapify up from index.
   * @param {number} i
   */
  heapifyUp(i) {
    while (i > 0 && this.compare(this.heap[i], this.heap[this.parent(i)]) < 0) {
      const parent = this.parent(i);
      this.swap(i, parent);
      i = parent;
    }
  }

  /**
   * Heapify down from index.
   * @param {number} i
   */
  heapifyDown(i) {
    const n = this.heap.length;
    for (;;) {
      let smallest = i;
      const left = this.leftChild(i);
      const right = this.rightChild(i);

      if (left < n && this.compare(this.heap[left], this.heap[smallest]) < 0) {
        smallest = left;
      }
      if (right < n && this.compare(this.heap[right], this.heap[smallest]) < 0) {
        smallest = right;
      }

      if (smallest === i) break;

      this.swap(i, smallest);
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
    this.heapifyUp(index);
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
      this.heapifyDown(0);
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
      this.heapifyUp(index);
    } else if (newPriority > oldPriority) {
      this.heapifyDown(index);
    }

    return true;
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
}

/**
 * Priority task queue with reprioritization support.
 */
export class TaskQueue {
  /**
   * @param {Object} [options] - Queue options
   * @param {number} [options.maxSize] - Maximum queue size
   */
  constructor(options = {}) {
    this.heap = new MinHeap();
    this.maxSize = options.maxSize || Infinity;
    /** @type {Map<string, Task>} */
    this.taskMap = new Map();
    this.stats = {
      enqueued: 0,
      dequeued: 0,
      reprioritized: 0
    };
  }

  /**
   * Enqueue a task with priority.
   * @param {Object} task - Task to enqueue
   * @param {string} task.id - Unique task identifier
   * @param {Function} task.execute - Task execution function
   * @param {number} [priority=Priority.NORMAL] - Task priority
   * @param {*} [data] - Optional task data
   * @param {Object} [metadata] - Optional metadata
   * @returns {Task} The enqueued task
   * @throws {Error} If queue is full or task ID already exists
   */
  enqueue(task, priority = Priority.NORMAL, data, metadata) {
    if (this.taskMap.has(task.id)) {
      throw new Error(`Task with id "${task.id}" already exists`);
    }

    if (this.heap.size >= this.maxSize) {
      throw new Error('Task queue is full');
    }

    const queueTask = {
      id: task.id,
      execute: task.execute,
      priority,
      enqueuedAt: Date.now(),
      data,
      metadata: {
        ...metadata,
        enqueueCount: (metadata?.enqueueCount || 0) + 1
      }
    };

    this.heap.insert(queueTask);
    this.taskMap.set(task.id, queueTask);
    this.stats.enqueued++;

    return queueTask;
  }

  /**
   * Dequeue the highest priority task.
   * @returns {Task|null}
   */
  dequeue() {
    const task = this.heap.extractMin();
    if (task) {
      this.taskMap.delete(task.id);
      this.stats.dequeued++;
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
    const success = this.heap.updatePriority(taskId, newPriority);
    if (success) {
      const task = this.taskMap.get(taskId);
      if (task) {
        task.metadata = { ...task.metadata, reprioritizedAt: Date.now() };
      }
      this.stats.reprioritized++;
    }
    return success;
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
   * Get queue size.
   * @returns {number}
   */
  get size() {
    return this.heap.size;
  }

  /**
   * Check if queue is empty.
   * @returns {boolean}
   */
  isEmpty() {
    return this.heap.isEmpty();
  }

  /**
   * Clear all tasks from queue.
   */
  clear() {
    this.heap = new MinHeap();
    this.taskMap.clear();
  }

  /**
   * Get queue statistics.
   * @returns {Object}
   */
  getStats() {
    return { ...this.stats };
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
}

export default TaskQueue;
