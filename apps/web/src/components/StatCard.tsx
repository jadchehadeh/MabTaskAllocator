import type { LucideIcon } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string;
  icon: LucideIcon;
  tone: "blue" | "green" | "amber" | "red";
}

export function StatCard({ label, value, icon: Icon, tone }: StatCardProps) {
  return (
    <section className={`stat-card stat-card-${tone}`}>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
      </div>
      <Icon aria-hidden="true" size={22} />
    </section>
  );
}
