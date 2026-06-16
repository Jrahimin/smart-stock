import type { LucideIcon } from "lucide-react";
import type { MouseEvent } from "react";

type AdminIconActionProps = {
  icon: LucideIcon;
  label: string;
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  tone?: "default" | "info" | "success" | "danger";
};

export function AdminIconAction({ icon: Icon, label, onClick, disabled, tone = "default" }: AdminIconActionProps) {
  return (
    <button
      aria-label={label}
      className={`admin-icon-action admin-icon-action-${tone}`}
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
    >
      <Icon size={16} />
    </button>
  );
}
