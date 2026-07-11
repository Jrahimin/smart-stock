"use client";

import { guideCharacterAssetByPose } from "@/features/guide/character/guide-character-assets";

type GuideTourNudgeProps = {
  eyebrow?: string;
  message?: string;
  onAccept: () => void;
  onDismiss: () => void;
  onSnooze: () => void;
  title?: string;
};

export function GuideTourNudge({
  eyebrow = "ট্যুর গাইড",
  message = "ড্যাশবোর্ড ও মেনুর মূল অংশগুলো দেখে নিতে আমি আপনাকে সংক্ষিপ্ত ট্যুরে নিয়ে যেতে পারি।",
  onAccept,
  onDismiss,
  onSnooze,
  title = "আপনি কি গাইডের সহায়তায় ঘুরে আসতে চান?",
}: GuideTourNudgeProps) {
  return (
    <div className="product-guide-nudge-root" lang="bn">
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
            এখন নয়
          </button>
          <button className="product-guide-skip-button" onClick={onDismiss} type="button">
            আর জিজ্ঞেস করবেন না
          </button>
          <button className="product-guide-primary-button" onClick={onAccept} type="button">
            হ্যাঁ, শুরু করি
          </button>
        </div>
      </div>
    </div>
  );
}
