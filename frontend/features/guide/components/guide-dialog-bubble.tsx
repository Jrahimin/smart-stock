"use client";

import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { useEffect, useRef, type KeyboardEvent } from "react";

import { GuideCharacter } from "@/features/guide/components/guide-character";
import type { GuideBox } from "@/features/guide/lib/guide-positioning";
import type { GuideCharacterPose, GuideDialog } from "@/features/guide/types/guide-types";

type GuideDialogBubbleProps = {
  dialog: GuideDialog;
  position: GuideBox;
  stepIndex: number;
  stepCount: number;
  phaseLabel: string;
  phaseStepIndex: number;
  phaseStepCount: number;
  characterPose: GuideCharacterPose;
  showInlineCharacter: boolean;
  isLastStep: boolean;
  isSkipConfirmationOpen: boolean;
  suppressContextualPrompts: boolean;
  onCancelSkip: () => void;
  onConfirmSkip: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onSkip: () => void;
  onSuppressContextualPromptsChange: (nextValue: boolean) => void;
};

export function GuideDialogBubble({
  dialog,
  position,
  stepIndex,
  stepCount,
  phaseLabel,
  phaseStepIndex,
  phaseStepCount,
  characterPose,
  showInlineCharacter,
  isLastStep,
  isSkipConfirmationOpen,
  suppressContextualPrompts,
  onCancelSkip,
  onConfirmSkip,
  onPrevious,
  onNext,
  onSkip,
  onSuppressContextualPromptsChange,
}: GuideDialogBubbleProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dialogRef.current?.focus();
  }, [stepIndex]);

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
      aria-describedby="product-guide-message"
      aria-labelledby="product-guide-title"
      aria-modal="true"
      className="product-guide-dialog"
      lang="bn"
      onKeyDown={trapFocus}
      ref={dialogRef}
      role="dialog"
      style={{ left: position.left, top: position.top, width: position.width }}
      tabIndex={-1}
    >
      <div className="product-guide-dialog-head">
        <div className="product-guide-dialog-title-block">
          {showInlineCharacter ? <GuideCharacter facing="right" pose={characterPose} variant="inline" /> : null}
          <div>
            <p className="product-guide-dialog-phase">{isSkipConfirmationOpen ? "গাইড বন্ধ করুন" : phaseLabel}</p>
            <h2 id="product-guide-title">
              {isSkipConfirmationOpen ? "এখনই গাইড বাদ দেবেন?" : dialog.eyebrow}
            </h2>
          </div>
        </div>
        <button aria-label="গাইড বন্ধ করুন" className="product-guide-icon-button" onClick={onSkip} type="button">
          <X aria-hidden="true" size={15} />
        </button>
      </div>

      <p className="product-guide-dialog-message" id="product-guide-message">
        {isSkipConfirmationOpen
          ? "এখন বন্ধ করলে পরে ড্যাশবোর্ডের ট্যুর বাটন থেকে আবার দেখতে পারবেন।"
          : dialog.message}
      </p>

      {!isSkipConfirmationOpen ? (
        <div className="product-guide-progress" role="status">
          <div className="product-guide-progress-meta">
            <span className="product-guide-progress-phase">{phaseLabel}</span>
            <span className="product-guide-progress-count">
              {phaseStepIndex + 1} / {phaseStepCount}
            </span>
          </div>
          <div aria-hidden="true" className="product-guide-progress-segments">
            {Array.from({ length: phaseStepCount }, (_, index) => (
              <span
                className={index <= phaseStepIndex ? "product-guide-progress-segment is-active" : "product-guide-progress-segment"}
                key={`${phaseLabel}-${index}`}
              />
            ))}
          </div>
          <span className="sr-only">
            {stepIndex + 1} of {stepCount}
          </span>
        </div>
      ) : null}

      <label className="product-guide-suppress-option">
        <input
          checked={suppressContextualPrompts}
          onChange={(event) => onSuppressContextualPromptsChange(event.target.checked)}
          type="checkbox"
        />
        <span>ভবিষ্যতে স্বয়ংক্রিয়ভাবে এই গাইড দেখাবেন না</span>
      </label>

      {isSkipConfirmationOpen ? (
        <div className="product-guide-confirm-actions">
          <button className="product-guide-secondary-button" onClick={onCancelSkip} type="button">
            চালিয়ে যান
          </button>
          <button className="product-guide-primary-button" onClick={onConfirmSkip} type="button">
            বাদ দিন
          </button>
        </div>
      ) : (
        <div className="product-guide-dialog-actions">
          {stepIndex > 0 ? (
            <button className="product-guide-secondary-button" onClick={onPrevious} type="button">
              <ArrowLeft aria-hidden="true" size={14} />
              তার আগে
            </button>
          ) : (
            <span aria-hidden="true" className="product-guide-action-spacer" />
          )}
          <div className="product-guide-action-end">
            <button className="product-guide-skip-button" onClick={onSkip} type="button">
              বাদ দিন
            </button>
            <button className="product-guide-primary-button" onClick={onNext} type="button">
              {isLastStep ? "শুরু করি" : "তারপর"}
              <ArrowRight aria-hidden="true" size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
