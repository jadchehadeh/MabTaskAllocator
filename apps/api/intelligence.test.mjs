import test from "node:test";
import assert from "node:assert/strict";
import { buildOperationalIntelligence } from "./intelligence.mjs";

test("flags overdue blocked work and recommends the least-loaded eligible user", () => {
  const users = [
    { id: "busy", role: "user", department: "Engineering" },
    { id: "free", role: "user", department: "Engineering" }
  ];
  const tasks = [
    { id: "risk", department: "Engineering", taskType: "Technical", complexity: 5, priority: "urgent", status: "blocked", dueDate: "2026-01-01", progress: 10, createdAt: "2025-12-01T00:00:00.000Z", assigneeIds: ["busy"], reopenCount: 1 },
    { id: "load", department: "Engineering", taskType: "Technical", complexity: 5, priority: "high", status: "in_progress", dueDate: "2026-01-03", progress: 20, createdAt: "2025-12-01T00:00:00.000Z", assigneeIds: ["busy"], reopenCount: 0 }
  ];
  const result = buildOperationalIntelligence(tasks, users, new Date("2026-02-01T00:00:00.000Z"));
  assert.equal(result.taskInsights[0].riskLevel, "critical");
  assert.equal(result.taskInsights[0].suggestedAssigneeId, "free");
  assert.ok(result.workforceInsights.find((item) => item.userId === "busy").burnoutRisk > result.workforceInsights.find((item) => item.userId === "free").burnoutRisk);
});

test("keeps an empty portfolio healthy", () => {
  const result = buildOperationalIntelligence([], [], new Date("2026-02-01T00:00:00.000Z"));
  assert.equal(result.portfolio.healthScore, 100);
  assert.equal(result.portfolio.highRiskTasks, 0);
});
