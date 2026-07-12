"use client";

import { guideCharacterAssetByPose } from "@/features/guide/character/guide-character-assets";
import type { GuideNudgeCopy } from "@/features/guide/dialogs/dashboard-dialogs";
import type { AppLocale } from "@/lib/locale/app-locale";

type GuideTourNudgeProps = GuideNudgeCopy & {
  locale: AppLocale;
  onAccept: () => void;
  onDismiss: () => void;
  onSnooze: () => void;
};

export function GuideTourNudge({
  accept,
  dismiss,
  eyebrow,
  locale,
  message,
  onAccept,
  onDismiss,
  onSnooze,
  snooze,
  title,
}: GuideTourNudgeProps) {
  return (
    <div className="product-guide-nudge-root" lang={locale}>
      <div
        aria-describedby="product-guide-nudge-message"
        aria-labelledby="product-guide-nudge-title"
        aria-modal="true"
        className="product-guide-nudge"
        role="dialog"
      >
        <div className="product-guide-nudge-head">
          <img
            alt=""
            aria-hidden="true"
            className="product-guide-nudge-mascot"
            src={guideCharacterAssetByPose.welcome}
          />
          <div>
            <p className="product-guide-nudge-eyebrow">{eyebrow}</p>
            <h2 id="product-guide-nudge-title">{title}</h2>
          </div>
        </div>

        <p className="product-guide-nudge-message" id="product-guide-nudge-message">
          {message}
        </p>

        <div className="product-guide-nudge-actions">
          <button className="product-guide-secondary-button" onClick={onSnooze} type="button">
            {snooze}
          </button>
          <button className="product-guide-skip-button" onClick={onDismiss} type="button">
            {dismiss}
          </button>
          <button className="product-guide-primary-button" onClick={onAccept} type="button">
            {accept}
          </button>
        </div>
      </div>
    </div>
  );
}
