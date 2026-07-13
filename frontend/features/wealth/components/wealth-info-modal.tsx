"use client";

import { WorkspaceModal } from "@/components/ui/workspace-modal";
import type { AppLocale } from "@/lib/locale/app-locale";
import { CalendarDays, HandHeart, ReceiptText, WalletCards } from "lucide-react";

type WealthInfoModalProps = {
  closeLabel: string;
  content: {
    calculatorSteps: string[];
    calculatorTitle: string;
    eyebrow: string;
    intro: string;
    note: string;
    rateBody: string;
    rateTitle: string;
    sections: Array<{ icon: string; title: string; body: string }>;
    title: string;
  };
  isOpen: boolean;
  locale: AppLocale;
  onClose: () => void;
};

export function WealthInfoModal({ closeLabel, content, isOpen, locale, onClose }: WealthInfoModalProps) {
  return (
    <WorkspaceModal isOpen={isOpen} onClose={onClose} size="large" title={content.title}>
      <div className="wealth-info-modal" lang={locale}>
        <div className="wealth-info-modal-opening">
          <span aria-hidden="true" className="wealth-info-modal-opening-mark">✦</span>
          <div>
            <p className="eyebrow">{content.eyebrow}</p>
            <p className="wealth-info-modal-intro">{content.intro}</p>
          </div>
        </div>
        <section className="wealth-info-modal-rate">
          <span aria-hidden="true">2.5%</span>
          <div>
            <h4>{content.rateTitle}</h4>
            <p>{content.rateBody}</p>
          </div>
        </section>
        <div className="wealth-info-modal-grid">
          {content.sections.map((section, index) => (
            <article className={`wealth-info-modal-card ${index === 3 ? "wealth-info-modal-card-intention" : ""}`} key={section.title}>
              <span aria-hidden="true" className="wealth-info-modal-icon"><GuideIcon index={index} /></span>
              <h4>{section.title}</h4>
              <p>{section.body}</p>
            </article>
          ))}
        </div>
        <section className="wealth-info-modal-checklist">
          <h4>{content.calculatorTitle}</h4>
          <ol>
            {content.calculatorSteps.map((step) => <li key={step}>{step}</li>)}
          </ol>
        </section>
        <aside className="wealth-info-modal-note">
          <span aria-hidden="true">!</span>
          <p>{content.note}</p>
        </aside>
        <button className="wealth-primary-button" onClick={onClose} type="button">{closeLabel}</button>
      </div>
    </WorkspaceModal>
  );
}

function GuideIcon({ index }: { index: number }) {
  const Icon = [CalendarDays, WalletCards, ReceiptText, HandHeart][index] ?? WalletCards;
  return <Icon size={16} strokeWidth={1.8} />;
}
