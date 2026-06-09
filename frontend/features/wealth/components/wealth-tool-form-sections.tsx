"use client";

type WealthFormSectionBreakProps = {
  hint?: string;
  title: string;
};

export function WealthFormSectionBreak({ title, hint }: WealthFormSectionBreakProps) {
  return (
    <div className="wealth-form-section-break">
      <span>{title}</span>
      {hint ? <p>{hint}</p> : null}
    </div>
  );
}
