"use client";

import { Loader2 } from "lucide-react";

import { StockHoldingAutocomplete } from "@/features/portfolio/components/stock-holding-autocomplete";
import type { AddHoldingModalController } from "@/features/portfolio/hooks/use-add-holding-modal";
import { portfolioLanguage } from "@/features/portfolio/portfolio-language";
import {
  financialTone,
  formatPortfolioMoney,
  formatSignedPercent,
} from "@/features/portfolio/view-models/portfolio-view-model";
import { WorkspaceModal } from "@/components/ui/workspace-modal";
import type { AppLocale } from "@/lib/locale/app-locale";

type AddHoldingModalProps = {
  locale: AppLocale;
  controller: AddHoldingModalController;
};

function primaryLabel(locale: AppLocale, mode: AddHoldingModalController["mode"]) {
  const t = portfolioLanguage[locale];
  return mode === "edit" ? t.updateHolding : t.addToPortfolio;
}

export function AddHoldingModal({ locale, controller }: AddHoldingModalProps) {
  const t = portfolioLanguage[locale];
  const {
    isOpen,
    mode,
    close,
    quantity,
    setQuantity,
    averageBuyPrice,
    setAverageBuyPrice,
    note,
    setNote,
    noteExpanded,
    setNoteExpanded,
    showValidation,
    validation,
    preview,
    existingState,
    selectedStock,
    submit,
    isSaving,
    saveError,
  } = controller;

  const showPreview =
    selectedStock != null
    && validation.quantity == null
    && validation.averageBuyPrice == null
    && quantity.trim() !== ""
    && averageBuyPrice.trim() !== "";

  const priceStatusMessage = (() => {
    if (!selectedStock) return null;
    if (preview.priceStatus === "UNAVAILABLE") return t.previewPriceUnavailable;
    if (preview.priceStatus === "STALE_LAST_KNOWN") return t.previewPriceStale;
    if (preview.priceStatus === "SUSPICIOUS") return t.previewPriceSuspicious;
    return null;
  })();

  return (
    <WorkspaceModal
      isOpen={isOpen}
      onClose={close}
      title={mode === "edit" ? t.updateHoldingTitle : t.addHoldingTitle}
    >
      <form
        className="add-holding-modal"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <StockHoldingAutocomplete controller={controller} locale={locale} />

        {existingState.isWatched && !existingState.isHolding && selectedStock ? (
          <p className="add-holding-watchlist-hint">{t.alreadyOnWatchlist}</p>
        ) : null}

        <div className="add-holding-grid">
          <label className="add-holding-field">
            <span className="add-holding-label">{t.quantity}</span>
            <input
              aria-invalid={showValidation && Boolean(validation.quantity)}
              className={showValidation && validation.quantity ? "has-error" : ""}
              inputMode="decimal"
              min="0.0001"
              onChange={(event) => setQuantity(event.target.value)}
              step="0.0001"
              type="number"
              value={quantity}
            />
            {showValidation && validation.quantity ? (
              <small className="add-holding-field-error">{t.quantityRequired}</small>
            ) : null}
          </label>

          <label className="add-holding-field">
            <span className="add-holding-label">{t.averagePrice}</span>
            <input
              aria-invalid={showValidation && Boolean(validation.averageBuyPrice)}
              className={showValidation && validation.averageBuyPrice ? "has-error" : ""}
              inputMode="decimal"
              min="0.0001"
              onChange={(event) => setAverageBuyPrice(event.target.value)}
              step="0.0001"
              type="number"
              value={averageBuyPrice}
            />
            {showValidation && validation.averageBuyPrice ? (
              <small className="add-holding-field-error">{t.averageBuyPriceRequired}</small>
            ) : null}
          </label>
        </div>

        <div className="add-holding-note-block">
          <button
            className="add-holding-note-toggle"
            onClick={() => setNoteExpanded((value) => !value)}
            type="button"
          >
            {noteExpanded ? t.hideNote : t.addNoteToggle}
          </button>
          {noteExpanded ? (
            <textarea
              maxLength={2000}
              onChange={(event) => setNote(event.target.value)}
              placeholder={t.note}
              rows={3}
              value={note}
            />
          ) : null}
        </div>

        {showPreview ? (
          <div className="add-holding-preview" aria-live="polite">
            <div>
              <span>{t.previewInvested}</span>
              <strong>{formatPortfolioMoney(preview.investedAmount, locale)}</strong>
            </div>
            <div>
              <span>{t.previewCurrentValue}</span>
              <strong>{formatPortfolioMoney(preview.currentValue, locale)}</strong>
            </div>
            <div>
              <span>{t.previewUnrealized}</span>
              <strong className={`is-${financialTone(preview.unrealizedGainAmount)}`}>
                {formatPortfolioMoney(preview.unrealizedGainAmount, locale)}
              </strong>
              <small className={`is-${financialTone(preview.unrealizedGainPercent)}`}>
                {formatSignedPercent(preview.unrealizedGainPercent)}
              </small>
            </div>
            {priceStatusMessage ? (
              <p className="add-holding-preview-status">{priceStatusMessage}</p>
            ) : null}
            {preview.priceStatus === "STALE_LAST_KNOWN" || preview.priceStatus === "SUSPICIOUS" ? (
              <p className="add-holding-preview-status">{t.previewNoDailyFromStale}</p>
            ) : null}
          </div>
        ) : null}

        {saveError ? (
          <p className="add-holding-field-error" role="alert">{t.error}</p>
        ) : null}

        <div className="add-holding-actions">
          <button className="add-holding-secondary" disabled={isSaving} onClick={close} type="button">
            {t.cancel}
          </button>
          <button className="add-holding-primary" disabled={isSaving} type="submit">
            {isSaving ? (
              <>
                <Loader2 className="is-spinning" size={14} />
                {t.savingHolding}
              </>
            ) : (
              primaryLabel(locale, mode)
            )}
          </button>
        </div>
      </form>
    </WorkspaceModal>
  );
}
