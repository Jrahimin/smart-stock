"use client";

import { useEffect, useMemo, useState } from "react";

import Link from "next/link";

import { MetricCard } from "@/components/ui/metric-card";
import { WealthInsightCard } from "@/features/wealth/components/wealth-insight-card";
import { useMoneySnapshot } from "@/features/wealth/hooks/use-money-snapshot";
import { useWealthDashboard } from "@/features/wealth/hooks/use-wealth-dashboard";
import { readLocalMoneySnapshot, saveLocalMoneySnapshotDraft } from "@/features/wealth/lib/local-money-snapshot";
import { formatWealthCurrency } from "@/features/wealth/view-models/wealth-view-model";
import { useAuth } from "@/features/auth/context/auth-context";

const ASSET_CATEGORY_OPTIONS = [
  { value: "CASH", label: "Cash & savings" },
  { value: "DEPOSIT", label: "FDR / deposits" },
  { value: "STOCK", label: "Stocks" },
  { value: "GOLD", label: "Gold" },
  { value: "OTHER", label: "Other asset" },
] as const;

type DraftAsset = { category: string; label: string; value: string };
type DraftLiability = { category: string; label: string; balance: string; monthly_emi: string };

function emptyAsset(): DraftAsset {
  return { category: "DEPOSIT", label: "FDR", value: "" };
}

function emptyLiability(): DraftLiability {
  return { category: "LOAN", label: "Loan", balance: "", monthly_emi: "" };
}

export function MoneySnapshotView() {
  const { isAuthenticated } = useAuth();
  const { dashboard } = useWealthDashboard();
  const { snapshot, patchSnapshot, isSaving } = useMoneySnapshot();
  const localDraft = readLocalMoneySnapshot();

  const [monthlySavings, setMonthlySavings] = useState(
    String(snapshot?.monthly_savings ?? localDraft.monthly_savings ?? ""),
  );
  const [assets, setAssets] = useState<DraftAsset[]>([]);
  const [liabilities, setLiabilities] = useState<DraftLiability[]>([]);
  const [newAsset, setNewAsset] = useState<DraftAsset>(emptyAsset);
  const [newLiability, setNewLiability] = useState<DraftLiability>(emptyLiability);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthenticated && snapshot) {
      setMonthlySavings(String(snapshot.monthly_savings ?? ""));
      setAssets(
        snapshot.assets.map((asset) => ({
          category: asset.category,
          label: asset.label,
          value: String(asset.value),
        })),
      );
      setLiabilities(
        snapshot.liabilities.map((liability) => ({
          category: liability.category,
          label: liability.label,
          balance: String(liability.balance),
          monthly_emi: liability.monthly_emi != null ? String(liability.monthly_emi) : "",
        })),
      );
      return;
    }

    const draft = readLocalMoneySnapshot();
    setMonthlySavings(String(draft.monthly_savings ?? ""));
    setAssets(
      draft.assets.map((asset) => ({
        category: asset.category,
        label: asset.label,
        value: String(asset.value),
      })),
    );
    setLiabilities(
      draft.liabilities.map((liability) => ({
        category: liability.category,
        label: liability.label,
        balance: String(liability.balance),
        monthly_emi: liability.monthly_emi != null ? String(liability.monthly_emi) : "",
      })),
    );
  }, [isAuthenticated, snapshot]);

  const localTotals = useMemo(() => {
    const totalAssets = assets.reduce((sum, item) => sum + (Number(item.value) || 0), 0);
    const totalLiabilities = liabilities.reduce((sum, item) => sum + (Number(item.balance) || 0), 0);
    return {
      totalAssets,
      totalLiabilities,
      netWorth: totalAssets - totalLiabilities,
    };
  }, [assets, liabilities]);

  function handleAddAsset() {
    if (!newAsset.label.trim() || !newAsset.value) {
      return;
    }
    setAssets((current) => [...current, newAsset]);
    setNewAsset(emptyAsset());
  }

  function handleAddLiability() {
    if (!newLiability.label.trim() || !newLiability.balance) {
      return;
    }
    setLiabilities((current) => [...current, newLiability]);
    setNewLiability(emptyLiability());
  }

  async function handleSaveSnapshot() {
    const payloadAssets = assets
      .filter((item) => item.label.trim() && item.value)
      .map((item) => ({
        category: item.category,
        label: item.label.trim(),
        value: Number(item.value),
        currency: "BDT",
        liquidity_tier: item.category === "DEPOSIT" ? "LOCKED" : "IMMEDIATE",
      }));

    const payloadLiabilities = liabilities
      .filter((item) => item.label.trim() && item.balance)
      .map((item) => ({
        category: item.category,
        label: item.label.trim(),
        balance: Number(item.balance),
        monthly_emi: item.monthly_emi ? Number(item.monthly_emi) : null,
      }));

    if (!isAuthenticated) {
      saveLocalMoneySnapshotDraft({
        monthly_savings: monthlySavings ? Number(monthlySavings) : undefined,
        assets: payloadAssets.map((item) => ({
          category: item.category,
          label: item.label,
          value: item.value,
        })),
        liabilities: payloadLiabilities.map((item) => ({
          category: item.category,
          label: item.label,
          balance: item.balance,
          monthly_emi: item.monthly_emi ?? undefined,
        })),
      });
      setSaveMessage("Saved on this device. Sign in when you want to sync.");
      return;
    }

    await patchSnapshot({
      monthly_savings: monthlySavings ? Number(monthlySavings) : null,
      assets: payloadAssets,
      liabilities: payloadLiabilities,
    });
    setSaveMessage("Money Snapshot updated.");
  }

  const netWorth = isAuthenticated ? dashboard?.net_worth : localTotals.netWorth;
  const totalAssets = isAuthenticated ? dashboard?.total_assets : localTotals.totalAssets;
  const totalLiabilities = isAuthenticated ? dashboard?.total_liabilities : localTotals.totalLiabilities;

  return (
    <section className="wealth-snapshot-page">
      <header className="wealth-hero-card">
        <p className="eyebrow">My Financial Picture</p>
        <h1>Money Snapshot</h1>
        <p>
          Add broad asset and liability values here—no transaction history, no tax filing. This powers net worth and
          clarity on your dashboard.
        </p>
      </header>

      <div className="wealth-metric-grid">
        <MetricCard label="Net worth" tone="info" value={formatWealthCurrency(netWorth)} />
        <MetricCard label="Assets" tone="positive" value={formatWealthCurrency(totalAssets)} />
        <MetricCard label="Liabilities" tone="warning" value={formatWealthCurrency(totalLiabilities)} />
        <MetricCard
          label="Clarity score"
          tone="neutral"
          value={dashboard?.clarity_score ?? 0}
          helper="Grows as you save useful context"
        />
      </div>

      <section className="wealth-panel">
        <h2>Monthly savings</h2>
        <p className="wealth-muted-copy">Optional. Rough monthly amount you usually set aside.</p>
        <label className="wealth-field">
          <span>How much do you usually save monthly?</span>
          <input onChange={(event) => setMonthlySavings(event.target.value)} value={monthlySavings} />
        </label>
      </section>

      <section className="wealth-panel">
        <h2>Assets</h2>
        <p className="wealth-muted-copy">Add FDR, cash, stocks, gold, or other broad values.</p>
        <div className="wealth-snapshot-entry-form">
          <label className="wealth-field">
            <span>Type</span>
            <select
              onChange={(event) => setNewAsset((current) => ({ ...current, category: event.target.value }))}
              value={newAsset.category}
            >
              {ASSET_CATEGORY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="wealth-field">
            <span>Label</span>
            <input
              onChange={(event) => setNewAsset((current) => ({ ...current, label: event.target.value }))}
              placeholder="e.g. City Bank FDR"
              value={newAsset.label}
            />
          </label>
          <label className="wealth-field">
            <span>Value (BDT)</span>
            <input
              inputMode="decimal"
              onChange={(event) => setNewAsset((current) => ({ ...current, value: event.target.value }))}
              value={newAsset.value}
            />
          </label>
          <button className="wealth-chip" onClick={handleAddAsset} type="button">
            Add asset
          </button>
        </div>
        {assets.length > 0 ? (
          <div className="wealth-asset-mix-list">
            {assets.map((asset, index) => (
              <div className="wealth-asset-mix-row" key={`${asset.label}-${index}`}>
                <span>
                  {asset.label} <small>({asset.category})</small>
                </span>
                <strong>{formatWealthCurrency(asset.value)}</strong>
              </div>
            ))}
          </div>
        ) : (
          <p className="wealth-muted-copy">No assets added yet.</p>
        )}
      </section>

      <section className="wealth-panel">
        <h2>Liabilities</h2>
        <p className="wealth-muted-copy">Add loans or EMI commitments in broad terms.</p>
        <div className="wealth-snapshot-entry-form">
          <label className="wealth-field">
            <span>Label</span>
            <input
              onChange={(event) => setNewLiability((current) => ({ ...current, label: event.target.value }))}
              placeholder="e.g. Home loan"
              value={newLiability.label}
            />
          </label>
          <label className="wealth-field">
            <span>Outstanding balance (BDT)</span>
            <input
              inputMode="decimal"
              onChange={(event) => setNewLiability((current) => ({ ...current, balance: event.target.value }))}
              value={newLiability.balance}
            />
          </label>
          <label className="wealth-field">
            <span>Monthly EMI (optional)</span>
            <input
              inputMode="decimal"
              onChange={(event) => setNewLiability((current) => ({ ...current, monthly_emi: event.target.value }))}
              value={newLiability.monthly_emi}
            />
          </label>
          <button className="wealth-chip" onClick={handleAddLiability} type="button">
            Add liability
          </button>
        </div>
        {liabilities.length > 0 ? (
          <div className="wealth-asset-mix-list">
            {liabilities.map((liability, index) => (
              <div className="wealth-asset-mix-row" key={`${liability.label}-${index}`}>
                <span>{liability.label}</span>
                <strong>{formatWealthCurrency(liability.balance)}</strong>
              </div>
            ))}
          </div>
        ) : (
          <p className="wealth-muted-copy">No liabilities added yet.</p>
        )}
      </section>

      <div className="wealth-snapshot-save-row">
        <button className="wealth-primary-button" disabled={isSaving} onClick={() => void handleSaveSnapshot()} type="button">
          {isSaving ? "Saving…" : "Save Money Snapshot"}
        </button>
        {!isAuthenticated ? (
          <Link className="wealth-inline-link" href="/login">
            Sign in to sync across devices
          </Link>
        ) : null}
        {saveMessage ? <p className="wealth-local-note">{saveMessage}</p> : null}
      </div>

      {dashboard?.asset_mix?.length ? (
        <section className="wealth-panel">
          <h2>Saved asset mix</h2>
          <div className="wealth-asset-mix-list">
            {dashboard.asset_mix.map((item) => (
              <div className="wealth-asset-mix-row" key={item.category}>
                <span>{item.category}</span>
                <strong>{formatWealthCurrency(item.value)}</strong>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {dashboard?.insights?.length ? (
        <div className="wealth-insight-grid">
          {dashboard.insights.map((insight) => (
            <WealthInsightCard insight={insight} key={insight.id} />
          ))}
        </div>
      ) : null}
    </section>
  );
}
