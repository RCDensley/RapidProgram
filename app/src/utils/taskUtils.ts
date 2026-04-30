import { v4 as uuidv4 } from 'uuid'
import { AppData, Task, TaskBucket } from '../types'

// ─── Complete a task (with optional recurrence) ───────────────────────────────
/**
 * Marks a task complete. If the task has a recurrence set,
 * automatically generates the next occurrence into the same bucket.
 * Returns the updated AppData.
 */
export function completeTask(taskId: string, data: AppData): AppData {
  const task = data.tasks.find(t => t.id === taskId)
  if (!task) return data

  const completedTask: Task = { ...task, completedAt: new Date().toISOString() }

  let nextTask: Task | null = null
  if (task.recurrence && !task.completedAt) {
    nextTask = {
      ...task,
      id:          uuidv4(),
      completedAt: undefined,
      createdAt:   new Date().toISOString(),
      comments:    [],           // fresh comment thread
      order:       task.order,
    }
  }

  const tasks = data.tasks
    .map(t => t.id === taskId ? completedTask : t)
    .concat(nextTask ? [nextTask] : [])

  return { ...data, tasks }
}

/**
 * Reopen a completed task.
 */
export function reopenTask(taskId: string, data: AppData): AppData {
  const tasks = data.tasks.map(t =>
    t.id === taskId ? { ...t, completedAt: undefined } : t
  )
  return { ...data, tasks }
}

/**
 * Move a task to a new bucket (and optionally a new SOW).
 * Updates both the bucket and sowId, and saves via the setData callback.
 */
export function moveTask(
  taskId:    string,
  newBucket: TaskBucket,
  newSowId:  string | null,
  data:      AppData,
): AppData {
  const tasks = data.tasks.map(t =>
    t.id === taskId ? { ...t, bucket: newBucket, sowId: newSowId } : t
  )
  return { ...data, tasks }
}

/**
 * Format effort for display: "2h", "1.5d", "1w"
 */
export function formatEffort(effort: Task['effort']): string {
  const unitMap = { hours: 'h', days: 'd', weeks: 'w' }
  return `${effort.value}${unitMap[effort.unit]}`
}

/**
 * Format recurrence for display: "Daily", "Every 2 weeks", etc.
 */
export function formatRecurrence(rec: Task['recurrence']): string {
  if (!rec) return ''
  if (rec.interval === 1) return rec.type.charAt(0).toUpperCase() + rec.type.slice(1)
  const typeMap = { daily: 'days', weekly: 'weeks', monthly: 'months' }
  return `Every ${rec.interval} ${typeMap[rec.type]}`
}

/**
 * Get all incomplete tasks for a bucket + sowId combination.
 */
export function getTasksForBucket(
  bucket: TaskBucket,
  sowId:  string | null,
  data:   AppData,
): Task[] {
  return data.tasks
    .filter(t => t.bucket === sowId && !t.completedAt)
    .filter(t => t.sowId === sowId)
    .sort((a, b) => a.order - b.order)
}
