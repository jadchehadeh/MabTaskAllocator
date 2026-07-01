import type { LucideIcon } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string;
  icon: LucideIcon;
  tone: "blue" | "green" | "amber" | "red";
  onClick?: () => void;
}

export function StatCard({ label, value, icon: Icon, tone, onClick }: StatCardProps) {
  const content = <>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
      </div>
      <Icon aria-hidden="true" size={22} />
    </>;

  return onClick ? (
    <button className={`stat-card stat-card-${tone} stat-card-action`} onClick={onClick} type="button">{content}</button>
  ) : <section className={`stat-card stat-card-${tone}`}>{content}</section>;
}
