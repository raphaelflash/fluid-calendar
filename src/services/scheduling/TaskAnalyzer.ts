import { Task, Project } from "@prisma/client";
import { differenceInDays, differenceInMinutes } from "date-fns";

export interface TaskDependency {
  taskId: string;
  type: "hard" | "soft"; // hard = must complete before, soft = should complete before
  reason: string;
}

export interface RecurrencePattern {
  type: "daily" | "weekly" | "monthly";
  interval: number;
  daysOfWeek?: number[];
  endDate?: Date;
  occurrences?: number;
}

export interface TaskPriority {
  score: number;
  factors: {
    dueDate: number;
    importance: number;
    dependencies: number;
    userInteraction: number;
  };
}

export interface TaskAnalysis {
  priority: TaskPriority;
  estimatedDuration: number;
  dependencies: TaskDependency[];
  recurrencePattern?: RecurrencePattern;
  complexity: "low" | "medium" | "high";
}

export class TaskAnalyzer {
  constructor(private completedTasks: Task[] = []) {}

  async analyzeTask(task: Task, project?: Project): Promise<TaskAnalysis> {
    return {
      priority: await this.calculatePriority(task),
      estimatedDuration: this.estimateDuration(task),
      dependencies: await this.analyzeDependencies(task),
      recurrencePattern: this.analyzeRecurringPattern(task),
      complexity: this.assessComplexity(task),
    };
  }

  private async calculatePriority(task: Task): Promise<TaskPriority> {
    const factors = {
      dueDate: this.calculateDueDatePriority(task),
      importance: this.calculateImportancePriority(task),
      dependencies: await this.calculateDependencyPriority(task),
      userInteraction: this.calculateUserInteractionPriority(task),
    };

    // Weighted average of factors
    const weights = {
      dueDate: 2.0,
      importance: 1.5,
      dependencies: 1.0,
      userInteraction: 0.5,
    };

    const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
    const weightedSum = Object.entries(factors).reduce(
      (sum, [key, value]) => sum + value * weights[key as keyof typeof weights],
      0
    );

    return {
      score: weightedSum / totalWeight,
      factors,
    };
  }

  private calculateDueDatePriority(task: Task): number {
    if (!task.dueDate) return 0.5; // Neutral priority if no due date

    const daysToDeadline = differenceInDays(task.dueDate, new Date());
    if (daysToDeadline < 0) return 1; // Highest priority if overdue

    // Exponential increase in priority as deadline approaches
    return Math.min(1, Math.exp(-daysToDeadline / 7)); // 7 days as half-life
  }

  private calculateImportancePriority(task: Task): number {
    // Factors that indicate importance:
    // 1. Task has dependencies (other tasks depend on it)
    // 2. Part of a project
    // 3. Has a specific energy level requirement
    // 4. Has been rescheduled multiple times

    let importance = 0.5; // Start with neutral importance

    if (task.projectId) importance += 0.2;
    if (task.energyLevel) importance += 0.1;
    if (task.lastScheduled) importance += 0.1;

    return Math.min(1, importance);
  }

  private async calculateDependencyPriority(task: Task): Promise<number> {
    const dependencies = await this.analyzeDependencies(task);
    if (dependencies.length === 0) return 0.5;

    // Higher priority if task has many dependencies or hard dependencies
    const hardDependencies = dependencies.filter(
      (d) => d.type === "hard"
    ).length;
    return Math.min(
      1,
      0.5 + hardDependencies * 0.2 + dependencies.length * 0.1
    );
  }

  private calculateUserInteractionPriority(task: Task): number {
    // Factors that indicate user interest:
    // 1. Recently viewed/edited
    // 2. Manually scheduled before
    // 3. Has detailed description/notes
    // 4. Part of an active project

    let interactionScore = 0.5;

    if (task.scheduleLocked) interactionScore += 0.2; // User cares about timing
    if (task.description) interactionScore += 0.1; // User provided details
    if (task.preferredTime) interactionScore += 0.1; // User specified preference

    return Math.min(1, interactionScore);
  }

  private estimateDuration(task: Task): number {
    if (task.duration) return task.duration; // Use explicit duration if set

    // Find similar completed tasks
    const similarTasks = this.completedTasks.filter(
      (t) =>
        t.projectId === task.projectId || t.energyLevel === task.energyLevel
    );

    if (similarTasks.length > 0) {
      // Calculate average duration of similar tasks
      const totalDuration = similarTasks.reduce((sum, t) => {
        if (t.scheduledStart && t.scheduledEnd) {
          return sum + differenceInMinutes(t.scheduledEnd, t.scheduledStart);
        }
        return sum + (t.duration || 60);
      }, 0);
      return Math.round(totalDuration / similarTasks.length);
    }

    return 60; // Default to 1 hour if no better estimate available
  }

  private async analyzeDependencies(task: Task): Promise<TaskDependency[]> {
    const dependencies: TaskDependency[] = [];

    // For now, return empty array
    // This will be implemented when we add task dependency features

    return dependencies;
  }

  private analyzeRecurringPattern(task: Task): RecurrencePattern | undefined {
    if (!task.isRecurring || !task.recurrenceRule) return undefined;

    // Basic pattern detection - will be enhanced later
    if (task.recurrenceRule.includes("FREQ=DAILY")) {
      return {
        type: "daily",
        interval: 1,
      };
    }

    if (task.recurrenceRule.includes("FREQ=WEEKLY")) {
      return {
        type: "weekly",
        interval: 1,
        daysOfWeek: [task.scheduledStart?.getDay() || 0],
      };
    }

    return undefined;
  }

  private assessComplexity(task: Task): "low" | "medium" | "high" {
    let complexityScore = 0;

    // Factors that indicate complexity:
    if (task.duration && task.duration > 120) complexityScore++; // Long duration
    if (task.description?.length || 0 > 100) complexityScore++; // Detailed description
    if (task.projectId) complexityScore++; // Part of a project
    if (task.energyLevel === "high") complexityScore++; // Requires high energy
    if (task.isRecurring) complexityScore++; // Recurring task

    return complexityScore <= 1
      ? "low"
      : complexityScore <= 3
      ? "medium"
      : "high";
  }
}
