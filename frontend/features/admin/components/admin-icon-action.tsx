import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import type { MouseEvent } from "react";

type AdminIconActionProps = {
  icon: LucideIcon;
  label: string;
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  href?: string;
  disabled?: boolean;
  tone?: "default" | "info" | "success" | "danger";
};

export function AdminIconAction({
  icon: Icon,
  label,
  onClick,
  href,
  disabled,
  tone = "default",
}: AdminIconActionProps) {
  const className = `admin-icon-action admin-icon-action-${tone}`;

  if (href) {
    return (
      <Link aria-label={label} className={className} href={href} title={label}>
        <Icon size={16} />
      </Link>
    );
  }

  return (
    <button
      aria-label={label}
      className={className}
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
    >
      <Icon size={16} />
    </button>
  );
}
