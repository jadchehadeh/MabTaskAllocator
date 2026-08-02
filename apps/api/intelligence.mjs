const dayMs = 86_400_000;

function clamp(value, minimum = 0, maximum = 100) {
  return Math.min(maximum, Math.max(minimum, value));
}

function daysUntil(date, now) {
  if (!date) return null;
  return (new Date(`${date}T23:59:59Z`).getTime() - now.getTime()) / dayMs;
}

function elapsedDays(task, now) {
  const start = task.startedAt || task.createdAt;
  if (!start) return 0;
  const end = task.completedAtIso || now.toISOString();
  return Math.max(0, (new Date(end).getTime() - new Date(start).getTime()) / dayMs);
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((first, second) => first - second);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function buildOperationalIntelligence(tasks, users, now = new Date()) {
  const activeTasks = tasks.filter((task) => task.status !== "done");
  const completedTasks = tasks.filter((task) => task.status === "done" && task.completedAtIso);
  const usersById = new Map(users.map((user) => [user.id, user]));
  const workloadByUser = new Map();

  for (const task of activeTasks) {
    for (const userId of task.assigneeIds || []) {
      const current = workloadByUser.get(userId) || { activeTasks: 0, complexityLoad: 0, urgentTasks: 0, overdueTasks: 0, blockedTasks: 0 };
      current.activeTasks += 1;
      current.complexityLoad += Number(task.complexity) || 3;
      if (["high", "urgent"].includes(task.priority)) current.urgentTasks += 1;
      if (task.dueDate && task.dueDate < now.toISOString().slice(0, 10)) current.overdueTasks += 1;
      if (task.status === "blocked") current.blockedTasks += 1;
      workloadByUser.set(userId, current);
    }
  }

  const workforceInsights = users.filter((user) => user.role === "user").map((user) => {
    const workload = workloadByUser.get(user.id) || { activeTasks: 0, complexityLoad: 0, urgentTasks: 0, overdueTasks: 0, blockedTasks: 0 };
    const reopenPenalty = tasks
      .filter((task) => (task.assigneeIds || []).includes(user.id))
      .reduce((sum, task) => sum + (task.reopenCount || 0), 0);
    const burnoutRisk = Math.round(clamp(
      workload.complexityLoad * 4 +
      workload.activeTasks * 3 +
      workload.urgentTasks * 8 +
      workload.overdueTasks * 12 +
      workload.blockedTasks * 7 +
      Math.min(12, reopenPenalty * 2)
    ));
    const level = burnoutRisk >= 75 ? "critical" : burnoutRisk >= 55 ? "high" : burnoutRisk >= 30 ? "moderate" : "healthy";
    const reasons = [];
    if (workload.complexityLoad >= 15) reasons.push("High complexity load");
    if (workload.overdueTasks) reasons.push(`${workload.overdueTasks} overdue task(s)`);
    if (workload.urgentTasks >= 2) reasons.push(`${workload.urgentTasks} high-priority task(s)`);
    if (workload.blockedTasks) reasons.push(`${workload.blockedTasks} blocked task(s)`);
    if (!reasons.length) reasons.push("Workload is within healthy limits");
    return { userId: user.id, ...workload, burnoutRisk, level, reasons };
  });

  const riskByUser = new Map(workforceInsights.map((insight) => [insight.userId, insight]));
  const taskInsights = activeTasks.map((task) => {
    const remaining = daysUntil(task.dueDate, now);
    const elapsed = elapsedDays(task, now);
    const comparable = completedTasks.filter((candidate) =>
      candidate.department === task.department &&
      candidate.taskType === task.taskType &&
      Number(candidate.complexity) === Number(task.complexity)
    );
    const benchmarkDays = median(comparable.map((candidate) => elapsedDays(candidate, now)).filter((duration) => duration > 0));
    const assigneeRisks = (task.assigneeIds || []).map((userId) => riskByUser.get(userId)?.burnoutRisk || 0);
    const workloadRisk = assigneeRisks.length ? Math.max(...assigneeRisks) : 20;
    const deadlineRisk = remaining === null ? 12 : remaining < 0 ? 55 : remaining <= 1 ? 42 : remaining <= 3 ? 30 : remaining <= 7 ? 17 : 5;
    const progressExpected = benchmarkDays > 0 ? clamp((elapsed / benchmarkDays) * 100) : Math.min(80, elapsed * 5);
    const progressGap = Math.max(0, progressExpected - (Number(task.progress) || 0));
    const delayRisk = Math.round(clamp(
      deadlineRisk +
      progressGap * 0.32 +
      workloadRisk * 0.18 +
      (task.status === "blocked" ? 22 : 0) +
      (task.reopenCount || 0) * 7
    ));
    const priorityScore = Math.round(clamp(
      ({ low: 8, medium: 18, high: 30, urgent: 42 }[task.priority] || 15) +
      deadlineRisk * 0.65 +
      (Number(task.complexity) || 3) * 4 +
      (task.status === "blocked" ? 14 : 0) +
      (task.status === "under_review" ? 8 : 0) +
      Math.min(12, (task.reopenCount || 0) * 4)
    ));
    const smartPriority = priorityScore >= 80 ? "critical" : priorityScore >= 60 ? "high" : priorityScore >= 35 ? "medium" : "low";
    const eligible = workforceInsights
      .filter((insight) => usersById.get(insight.userId)?.department === task.department)
      .sort((first, second) => first.burnoutRisk - second.burnoutRisk || first.complexityLoad - second.complexityLoad);
    const reasons = [];
    if (remaining !== null && remaining < 0) reasons.push("Deadline has passed");
    else if (remaining !== null && remaining <= 3) reasons.push("Deadline is close");
    if (task.status === "blocked") reasons.push("Task is blocked");
    if (progressGap >= 20) reasons.push("Progress trails comparable work");
    if (workloadRisk >= 55) reasons.push("Assignee workload is elevated");
    if (task.reopenCount) reasons.push(`${task.reopenCount} reopen cycle(s)`);
    if (!reasons.length) reasons.push("No major delivery warning detected");
    return {
      taskId: task.id,
      delayRisk,
      riskLevel: delayRisk >= 75 ? "critical" : delayRisk >= 50 ? "high" : delayRisk >= 25 ? "moderate" : "low",
      priorityScore,
      smartPriority,
      benchmarkDays: benchmarkDays ? Number(benchmarkDays.toFixed(1)) : null,
      suggestedAssigneeId: eligible[0]?.userId,
      reasons
    };
  });

  const highRiskTasks = taskInsights.filter((insight) => insight.delayRisk >= 50).length;
  const overloadedUsers = workforceInsights.filter((insight) => insight.burnoutRisk >= 55).length;
  return {
    generatedAt: now.toISOString(),
    portfolio: {
      activeTasks: activeTasks.length,
      highRiskTasks,
      overloadedUsers,
      unassignedTasks: activeTasks.filter((task) => !(task.assigneeIds || []).length).length,
      healthScore: Math.round(clamp(100 - highRiskTasks * 8 - overloadedUsers * 10))
    },
    taskInsights,
    workforceInsights
  };
}
