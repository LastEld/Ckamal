/**
 * Tasks Commands
 * Create, list, and manage tasks
 */

import * as f from './utils/formatters.js';

// In-memory task storage (replace with actual DB in production)
const tasksStore = new Map();
let taskIdCounter = 1;

/**
 * Create a new task
 */
export async function createTask(description, options = {}) {
  if (!description) {
    return {
      success: false,
      error: 'Task description is required',
      output: f.error('Task description is required. Usage: cognimesh tasks create "<description>"')
    };
  }

  const spinner = f.createSpinner('Creating task');
  spinner.start();

  await delay(300);

  const task = {
    id: `TASK-${String(taskIdCounter++).padStart(4, '0')}`,
    description,
    status: 'pending',
    priority: options.priority || 'normal',
    assignedTo: options.assign || null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    tags: options.tags ? options.tags.split(',') : [],
    dueDate: options.due || null
  };

  tasksStore.set(task.id, task);

  spinner.succeed(`Task created: ${task.id}`);

  let output = '\n';
  output += f.success(`Task created successfully`) + '\n\n';
  output += f.box(
    f.keyValue({
      'ID': task.id,
      'Description': task.description,
      'Priority': formatPriority(task.priority),
      'Status': formatStatus(task.status),
      'Created': new Date(task.createdAt).toLocaleString()
    }), { title: 'Task Details', width: 60 }
  );

  return { success: true, output, data: task };
}

/**
 * List all tasks
 */
export async function listTasks(options = {}) {
  const spinner = f.createSpinner('Fetching tasks');
  spinner.start();

  await delay(200);

  const tasks = Array.from(tasksStore.values());
  
  // Add sample tasks if empty
  if (tasks.length === 0) {
    tasks.push(
      { id: 'TASK-0001', description: 'Review system architecture', status: 'in-progress', priority: 'high', createdAt: new Date().toISOString() },
      { id: 'TASK-0002', description: 'Update documentation', status: 'pending', priority: 'normal', createdAt: new Date().toISOString() },
      { id: 'TASK-0003', description: 'Run regression tests', status: 'completed', priority: 'high', createdAt: new Date().toISOString() }
    );
  }

  spinner.succeed(`Found ${tasks.length} tasks`);

  let output = '\n';
  output += f.header('TASK LIST', 'line');
  output += '\n\n';

  const filter = options.filter || options.status;
  const filteredTasks = filter 
    ? tasks.filter(t => t.status === filter || t.priority === filter)
    : tasks;

  if (filteredTasks.length === 0) {
    output += f.info('No tasks found');
    return { success: true, output, data: [] };
  }

  const taskData = filteredTasks.map(task => ({
    ID: task.id,
    Description: task.description.length > 30 
      ? task.description.substring(0, 27) + '...' 
      : task.description,
    Priority: formatPriority(task.priority),
    Status: formatStatus(task.status),
    Created: new Date(task.createdAt).toLocaleDateString()
  }));

  output += f.table(taskData, {
    columns: ['ID', 'Description', 'Priority', 'Status', 'Created']
  });

  // Summary
  const byStatus = {};
  tasks.forEach(t => { byStatus[t.status] = (byStatus[t.status] || 0) + 1; });
  
  output += '\n\n';
  output += f.colorize('Summary:', 'bright') + ' ';
  output += Object.entries(byStatus).map(([status, count]) => 
    `${formatStatus(status)}: ${count}`
  ).join(' | ');

  return { success: true, output, data: tasks };
}

/**
 * Get task details
 */
export async function getTask(taskId, options = {}) {
  const task = tasksStore.get(taskId);
  
  if (!task) {
    return {
      success: false,
      error: `Task not found: ${taskId}`,
      output: f.error(`Task not found: ${taskId}`)
    };
  }

  let output = '\n';
  output += f.box(
    f.keyValue({
      'ID': task.id,
      'Description': task.description,
      'Priority': formatPriority(task.priority),
      'Status': formatStatus(task.status),
      'Assigned To': task.assignedTo || 'Unassigned',
      'Tags': task.tags.join(', ') || 'None',
      'Created': new Date(task.createdAt).toLocaleString(),
      'Updated': new Date(task.updatedAt).toLocaleString()
    }), { title: 'Task Details', width: 60 }
  );

  return { success: true, output, data: task };
}

/**
 * Update task status
 */
export async function updateTask(taskId, status, options = {}) {
  const task = tasksStore.get(taskId);
  
  if (!task) {
    return {
      success: false,
      error: `Task not found: ${taskId}`,
      output: f.error(`Task not found: ${taskId}`)
    };
  }

  const validStatuses = ['pending', 'in-progress', 'completed', 'cancelled'];
  if (!validStatuses.includes(status)) {
    return {
      success: false,
      error: `Invalid status: ${status}. Valid: ${validStatuses.join(', ')}`,
      output: f.error(`Invalid status. Valid statuses: ${validStatuses.join(', ')}`)
    };
  }

  task.status = status;
  task.updatedAt = new Date().toISOString();

  return {
    success: true,
    output: f.success(`Task ${taskId} updated to ${formatStatus(status)}`),
    data: task
  };
}

/**
 * Delete a task
 */
export async function deleteTask(taskId, options = {}) {
  if (!tasksStore.has(taskId)) {
    return {
      success: false,
      error: `Task not found: ${taskId}`,
      output: f.error(`Task not found: ${taskId}`)
    };
  }

  tasksStore.delete(taskId);

  return {
    success: true,
    output: f.success(`Task ${taskId} deleted`),
    data: { id: taskId }
  };
}

// Helper functions
function formatPriority(priority) {
  const colors = {
    low: f.colorize('low', 'dim'),
    normal: f.colorize('normal', 'cyan'),
    high: f.colorize('high', 'yellow'),
    urgent: f.colorize('urgent', 'red')
  };
  return colors[priority] || priority;
}

function formatStatus(status) {
  const colors = {
    pending: f.colorize('● pending', 'dim'),
    'in-progress': f.colorize('● in-progress', 'blue'),
    completed: f.colorize('● completed', 'green'),
    cancelled: f.colorize('● cancelled', 'red')
  };
  return colors[status] || status;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export default {
  create: createTask,
  list: listTasks,
  get: getTask,
  update: updateTask,
  delete: deleteTask
};
