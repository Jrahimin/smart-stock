"use client";

import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { useEffect, useRef, type KeyboardEvent } from "react";

import { GuideCharacter } from "@/features/guide/components/guide-character";
import type { GuideCharacterPose, GuideDialog } from "@/features/guide/types/guide-types";

type GuideMobileSheetProps = {
  characterPose: GuideCharacterPose;
  compact?: boolean;
  dialog: GuideDialog;
  isDrawerTransitioning?: boolean;
  isLastStep: boolean;
  isSkipConfirmationOpen: boolean;
  onCancelSkip: () => void;
  onClose: () => void;
  onConfirmSkip: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onSkip: () => void;
  onSuppressContextualPromptsChange: (nextValue: boolean) => void;
  stepCount: number;
  stepIndex: number;
  suppressContextualPrompts: boolean;
};

export function GuideMobileSheet({
  characterPose,
  compact = false,
  dialog,
  isDrawerTransitioning = false,
  isLastStep,
  isSkipConfirmationOpen,
  onCancelSkip,
  onClose,
  onConfirmSkip,
  onNext,
  onPrevious,
  onSkip,
  onSuppressContextualPromptsChange,
  stepCount,
  stepIndex,
  suppressContextualPrompts,
}: GuideMobileSheetProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dialogRef.current?.focus();
  }, [stepIndex, isSkipConfirmationOpen]);

  function trapFocus(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Tab") {
      return;
    }

    const focusable = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled])'),
    );
    if (!focusable.length) {
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div
      aria-describedby="guide-mobile-message"
      aria-labelledby="guide-mobile-title"
      aria-modal="true"
      className={`guide-mobile-sheet${compact ? " guide-mobile-sheet--compact" : ""}`}
      lang="bn"
      onKeyDown={trapFocus}
      ref={dialogRef}
      role="dialog"
      tabIndex={-1}
    >
      <div className="guide-mobile-sheet-head">
        <div className="guide-mobile-sheet-title-block">
          <GuideCharacter facing="right" pose={characterPose} variant="inline" />
          <div>
            <p className="guide-mobile-sheet-phase">{isSkipConfirmationOpen ? "গাইড বন্ধ করুন" : "পরিচিতি"}</p>
            <h2 id="guide-mobile-title">{isSkipConfirmationOpen ? "এখনই গাইড বাদ দেবেন?" : dialog.eyebrow}</h2>
          </div>
        </div>
        <button aria-label="গাইড বন্ধ করুন" className="guide-mobile-icon-button" onClick={onClose} type="button">
          <X aria-hidden="true" size={16} />
        </button>
      </div>

      <p className="guide-mobile-sheet-message" id="guide-mobile-message">
        {isSkipConfirmationOpen
          ? "এখন বন্ধ করলে পরে হেডারের ম্যাসকট বাটন থেকে আবার দেখতে পারবেন।"
          : dialog.message}
      </p>

      {!isSkipConfirmationOpen ? (
        <div className="guide-mobile-progress" role="status">
          <div className="guide-mobile-progress-meta">
            <span className="guide-mobile-progress-label">পরিচিতি</span>
            <span className="guide-mobile-progress-count">
              {stepIndex + 1} / {stepCount}
            </span>
          </div>
          <div aria-hidden="true" className="guide-mobile-progress-segments">
            {Array.from({ length: stepCount }, (_, index) => (
              <span
                className={index <= stepIndex ? "guide-mobile-progress-segment is-active" : "guide-mobile-progress-segment"}
                key={`mobile-guide-${index}`}
              />
            ))}
          </div>
        </div>
      ) : (
        <label className="guide-mobile-suppress-option">
          <input
            checked={suppressContextualPrompts}
            onChange={(event) => onSuppressContextualPromptsChange(event.target.checked)}
            type="checkbox"
          />
          <span>ভবিষ্যতে স্বয়ংক্রিয়ভাবে এই গাইড দেখাবেন না</span>
        </label>
      )}

      {isSkipConfirmationOpen ? (
        <div className="guide-mobile-confirm-actions">
          <button className="guide-mobile-secondary-button" onClick={onCancelSkip} type="button">
            চালিয়ে যান
          </button>
          <button className="guide-mobile-primary-button" onClick={onConfirmSkip} type="button">
            বাদ দিন
          </button>
        </div>
      ) : (
        <div className="guide-mobile-sheet-actions">
          {stepIndex > 0 ? (
            <button className="guide-mobile-secondary-button" onClick={onPrevious} type="button">
              <ArrowLeft aria-hidden="true" size={14} />
              তার আগে
            </button>
          ) : (
            <span aria-hidden="true" className="guide-mobile-action-spacer" />
          )}
          <div className="guide-mobile-action-end">
            <button className="guide-mobile-skip-button" onClick={onSkip} type="button">
              বাদ দিন
            </button>
            <button
              className="guide-mobile-primary-button"
              disabled={isDrawerTransitioning}
              onClick={onNext}
              type="button"
            >
              {isLastStep ? "শুরু করি" : "তারপর"}
              <ArrowRight aria-hidden="true" size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
