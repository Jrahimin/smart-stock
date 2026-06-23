"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";

import { AdminPageHeader } from "@/features/admin/components/admin-page-header";
import { AdminSection, AdminEmptyState } from "@/features/admin/components/admin-data-table";
import { AdminTableSkeleton } from "@/features/admin/components/admin-skeleton";
import {
  type AdminTaxConfigScalars,
  type AdminTaxInvestmentCategory,
  type AdminTaxSlab,
  configsEqual,
  formatAdminCurrency,
  formatDisplayNumber,
  isOpenEndedSlab,
  prepareConfigPayload,
  slabsEqual,
} from "@/features/admin/lib/admin-tax-planner-form-helpers";
import { SuperAdminRoute } from "@/features/auth/components/admin-route";
import {
  fetchAdminTaxInvestmentCategories,
  fetchAdminTaxPlannerConfig,
  updateAdminTaxInvestmentCategories,
  updateAdminTaxPlannerConfig,
  updateAdminTaxPlannerSlabs,
} from "@/lib/api/admin-api";

const THRESHOLD_FIELDS: Array<{ key: keyof AdminTaxConfigScalars; label: string }> = [
  { key: "threshold_general", label: "General Taxpayer" },
  { key: "threshold_woman_or_senior", label: "Woman or Senior Citizen" },
  { key: "threshold_person_with_disability", label: "Person with Disability" },
  { key: "threshold_freedom_fighter", label: "Freedom Fighter" },
];

const MINIMUM_TAX_FIELDS: Array<{ key: keyof AdminTaxConfigScalars; label: string }> = [
  { key: "minimum_tax_national", label: "National Default" },
  { key: "minimum_tax_dhaka_ctg", label: "Dhaka / Chattogram" },
  { key: "minimum_tax_other_city", label: "Other City Corporation" },
  { key: "minimum_tax_rural", label: "Outside City Corporation" },
];

const REBATE_FIELDS: Array<{
  key: keyof AdminTaxConfigScalars;
  label: string;
  inputMode: "decimal" | "numeric";
}> = [
  { key: "rebate_taxable_income_limit_pct", label: "Income-Based Rebate Limit (%)", inputMode: "decimal" },
  { key: "rebate_investment_pct", label: "Investment-Based Rebate Rate (%)", inputMode: "decimal" },
  { key: "rebate_maximum_amount", label: "Maximum Rebate Cap (BDT)", inputMode: "numeric" },
];

export function AdminTaxPlannerView() {
  return (
    <SuperAdminRoute>
      <AdminTaxPlannerContent />
    </SuperAdminRoute>
  );
}

function AdminTaxPlannerContent() {
  const [activeTab, setActiveTab] = useState<"tax-rules" | "investment-categories">("tax-rules");

  return (
    <div className="admin-workspace admin-tax-planner-workspace workspace-page-stack">
      <AdminPageHeader description="Bangladesh income tax settings for the public calculator." title="Tax Planner" />

      <div className="admin-config-tabs admin-tax-planner-tabs" role="tablist">
        <button
          aria-selected={activeTab === "tax-rules"}
          className={activeTab === "tax-rules" ? "admin-config-tab admin-config-tab-active" : "admin-config-tab"}
          onClick={() => setActiveTab("tax-rules")}
          role="tab"
          type="button"
        >
          Tax Rules
        </button>
        <button
          aria-selected={activeTab === "investment-categories"}
          className={
            activeTab === "investment-categories" ? "admin-config-tab admin-config-tab-active" : "admin-config-tab"
          }
          onClick={() => setActiveTab("investment-categories")}
          role="tab"
          type="button"
        >
          Investment Categories
        </button>
      </div>

      {activeTab === "tax-rules" ? <TaxRulesPanel /> : <InvestmentCategoriesPanel />}
    </div>
  );
}

function AdminField({
  label,
  suffix,
  wide,
  children,
}: {
  label: string;
  suffix?: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <label className={`admin-composer-field ${wide ? "admin-composer-field-wide" : ""}`}>
      <span>{label}</span>
      {suffix ? (
        <div className="admin-composer-input-suffix">
          {children}
          <span className="admin-composer-suffix">{suffix}</span>
        </div>
      ) : (
        children
      )}
    </label>
  );
}

function TaxRulesPanel() {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-tax-planner-config"],
    queryFn: fetchAdminTaxPlannerConfig,
  });

  const serverConfig = data?.config as AdminTaxConfigScalars | undefined;
  const serverSlabs = (data?.slabs as AdminTaxSlab[] | undefined) ?? [];

  const [configDraft, setConfigDraft] = useState<AdminTaxConfigScalars | null>(null);
  const [slabsDraft, setSlabsDraft] = useState<AdminTaxSlab[] | null>(null);

  const config = configDraft ?? serverConfig;
  const slabs = slabsDraft ?? serverSlabs;

  const configDirty = serverConfig && config ? !configsEqual(config, serverConfig) : false;
  const slabsDirty = slabsDraft ? !slabsEqual(slabs, serverSlabs) : false;
  const changeCount = (configDirty ? 1 : 0) + (slabsDirty ? 1 : 0);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!config) {
        return;
      }

      const tasks: Array<Promise<unknown>> = [];
      if (configDirty) {
        tasks.push(updateAdminTaxPlannerConfig(prepareConfigPayload(config)));
      }
      if (slabsDirty) {
        tasks.push(
          updateAdminTaxPlannerSlabs(
            slabs.map((row) => ({
              sort_order: row.sort_order,
              band_amount: row.band_amount,
              rate: row.rate,
              label: row.label,
              is_allowance_band: row.is_allowance_band,
            })),
          ),
        );
      }
      await Promise.all(tasks);
    },
    onSuccess: () => {
      setConfigDraft(null);
      setSlabsDraft(null);
      void queryClient.invalidateQueries({ queryKey: ["admin-tax-planner-config"] });
      void queryClient.invalidateQueries({ queryKey: ["wealth", "tax-planner", "config"] });
    },
  });

  const updateConfigField = <K extends keyof AdminTaxConfigScalars>(key: K, value: AdminTaxConfigScalars[K]) => {
    if (!config) {
      return;
    }
    setConfigDraft({ ...config, [key]: value });
  };

  const updateSlabRow = (index: number, patch: Partial<AdminTaxSlab>) => {
    const next = [...slabs];
    next[index] = { ...next[index], ...patch };

    if (patch.is_allowance_band) {
      for (let rowIndex = 0; rowIndex < next.length; rowIndex += 1) {
        if (rowIndex !== index) {
          next[rowIndex] = { ...next[rowIndex], is_allowance_band: false };
        }
      }
    }

    setSlabsDraft(next);
  };

  if (isLoading) {
    return <AdminTableSkeleton rows={6} />;
  }

  if (error || !config) {
    return (
      <AdminEmptyState
        description="Refresh the page or check the API connection."
        title="Could not load tax planner configuration"
      />
    );
  }

  return (
    <div className="admin-tax-planner-stack">
      <p className="admin-tax-planner-callout">
        Calculation rules are built into the application. Use this page to update the tax-law amounts taxpayers see
        and the calculator uses.
      </p>

      <AdminSection className="admin-section-compact" title="General Settings">
        <div className="admin-composer-grid admin-tax-planner-grid-compact">
          <AdminField label="Tax Year Label">
            <input
              onChange={(event) => updateConfigField("tax_year_label", event.target.value)}
              type="text"
              value={config.tax_year_label}
            />
          </AdminField>
          <AdminField label="Public Display Name">
            <input
              onChange={(event) => updateConfigField("display_name", event.target.value)}
              type="text"
              value={config.display_name}
            />
          </AdminField>
          <AdminField label="Public Disclaimer" wide>
            <textarea
              onChange={(event) => updateConfigField("disclaimer", event.target.value)}
              rows={2}
              value={config.disclaimer}
            />
          </AdminField>
          <AdminField label="Minimum Tax Notice" wide>
            <textarea
              onChange={(event) => updateConfigField("minimum_tax_note", event.target.value)}
              rows={2}
              value={config.minimum_tax_note}
            />
          </AdminField>
        </div>
      </AdminSection>

      <AdminSection className="admin-section-compact" title="Tax Limits">
        <div className="admin-tax-planner-limits">
          <div className="admin-tax-planner-subsection">
            <span className="admin-tax-planner-subsection-title">Tax-Free Income Thresholds</span>
            <div className="admin-composer-grid admin-composer-grid-4 admin-tax-planner-grid-compact">
              {THRESHOLD_FIELDS.map((field) => (
                <AdminField key={field.key} label={field.label} suffix="BDT">
                  <input
                    inputMode="numeric"
                    onChange={(event) => updateConfigField(field.key, event.target.value)}
                    type="text"
                    value={formatDisplayNumber(config[field.key])}
                  />
                </AdminField>
              ))}
            </div>
          </div>
          <div className="admin-tax-planner-subsection">
            <span className="admin-tax-planner-subsection-title">Investment Tax Rebate</span>
            <p className="admin-tax-planner-rebate-hint">
              The tax rebate is limited by the lowest applicable value from income, investment, and the maximum rebate
              cap.
            </p>
            <div className="admin-composer-grid admin-tax-planner-grid-compact admin-tax-planner-rebate-grid">
              {REBATE_FIELDS.map((field) => (
                <AdminField key={field.key} label={field.label}>
                  <input
                    inputMode={field.inputMode}
                    onChange={(event) => updateConfigField(field.key, event.target.value)}
                    type="text"
                    value={formatDisplayNumber(config[field.key])}
                  />
                </AdminField>
              ))}
            </div>
            <p className="admin-tax-planner-rebate-preview">
              <strong>Current Rule:</strong>{" "}
              {formatDisplayNumber(config.rebate_taxable_income_limit_pct)}% of taxable income •{" "}
              {formatDisplayNumber(config.rebate_investment_pct)}% of investment • Max BDT{" "}
              {formatAdminCurrency(config.rebate_maximum_amount)}
            </p>
          </div>
          <div className="admin-tax-planner-subsection">
            <span className="admin-tax-planner-subsection-title">Minimum Tax Amounts</span>
            <div className="admin-composer-grid admin-composer-grid-4 admin-tax-planner-grid-compact">
              {MINIMUM_TAX_FIELDS.map((field) => (
                <AdminField key={field.key} label={field.label} suffix="BDT">
                  <input
                    inputMode="numeric"
                    onChange={(event) => updateConfigField(field.key, event.target.value)}
                    type="text"
                    value={formatDisplayNumber(config[field.key])}
                  />
                </AdminField>
              ))}
            </div>
          </div>
        </div>
      </AdminSection>

      <AdminSection className="admin-section-compact" title="Progressive Tax Brackets">
        <div className="admin-data-table-shell admin-tax-planner-data-shell">
          <div className="admin-data-table admin-data-table-tax-slabs">
            <div className="admin-data-table-head">
              <span>Order</span>
              <span>Band Label</span>
              <span>Band Size</span>
              <span>Tax Rate</span>
              <span>Tax-Free</span>
            </div>
            <div className="admin-data-table-body">
              {slabs.map((row, index) => {
                const openEnded = isOpenEndedSlab(row);
                const rowClass = [
                  "admin-data-table-row",
                  row.is_allowance_band ? "admin-tax-slab-row-allowance" : "",
                  openEnded ? "admin-tax-slab-row-open" : "",
                ]
                  .filter(Boolean)
                  .join(" ");

                return (
                  <div className={rowClass} key={`${row.sort_order}-${index}`}>
                    <div className="admin-data-table-cell">
                      <input
                        inputMode="numeric"
                        onChange={(event) => updateSlabRow(index, { sort_order: Number(event.target.value) || 0 })}
                        type="text"
                        value={row.sort_order}
                      />
                    </div>
                    <div className="admin-data-table-cell">
                      <input
                        onChange={(event) => updateSlabRow(index, { label: event.target.value })}
                        type="text"
                        value={row.label}
                      />
                    </div>
                    <div className="admin-data-table-cell">
                      <div className="admin-composer-input-suffix">
                        <input
                          onChange={(event) =>
                            updateSlabRow(index, { band_amount: event.target.value === "" ? null : event.target.value })
                          }
                          placeholder={openEnded ? "∞" : undefined}
                          type="text"
                          value={openEnded ? "" : formatDisplayNumber(row.band_amount)}
                        />
                        {!openEnded ? <span className="admin-composer-suffix">BDT</span> : null}
                      </div>
                    </div>
                    <div className="admin-data-table-cell">
                      <div className="admin-composer-input-suffix">
                        <input
                          inputMode="decimal"
                          onChange={(event) => updateSlabRow(index, { rate: event.target.value })}
                          type="text"
                          value={formatDisplayNumber(row.rate)}
                        />
                        <span className="admin-composer-suffix">%</span>
                      </div>
                    </div>
                    <div className="admin-data-table-cell admin-tax-slab-allowance-cell">
                      <input
                        aria-label="Tax-free allowance band"
                        checked={row.is_allowance_band}
                        onChange={(event) => updateSlabRow(index, { is_allowance_band: event.target.checked })}
                        type="checkbox"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </AdminSection>

      <div className="admin-tax-planner-sticky-footer">
        <span
          className={
            changeCount ? "admin-tax-planner-action-status admin-tax-planner-action-status-dirty" : "admin-tax-planner-action-status"
          }
        >
          {changeCount ? `${changeCount} unsaved` : "No changes"}
        </span>
        <button
          className="admin-btn admin-btn-primary"
          disabled={!changeCount || saveMutation.isPending}
          onClick={() => saveMutation.mutate()}
          type="button"
        >
          {saveMutation.isPending ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}

function InvestmentCategoriesPanel() {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-tax-investment-categories"],
    queryFn: fetchAdminTaxInvestmentCategories,
  });

  const serverRows = (data as AdminTaxInvestmentCategory[] | undefined) ?? [];
  const [draftRows, setDraftRows] = useState<AdminTaxInvestmentCategory[] | null>(null);
  const rows = draftRows ?? serverRows;

  const isDirty = useMemo(() => {
    if (!draftRows) {
      return false;
    }
    return JSON.stringify(draftRows) !== JSON.stringify(serverRows);
  }, [draftRows, serverRows]);

  const saveMutation = useMutation({
    mutationFn: () =>
      updateAdminTaxInvestmentCategories(
        rows.map((row) => ({
          category_key: row.category_key,
          display_label: row.display_label,
          sort_order: row.sort_order,
          is_enabled: row.is_enabled,
        })),
      ),
    onSuccess: () => {
      setDraftRows(null);
      void queryClient.invalidateQueries({ queryKey: ["admin-tax-investment-categories"] });
      void queryClient.invalidateQueries({ queryKey: ["wealth", "tax-planner", "config"] });
    },
  });

  const updateRow = (index: number, patch: Partial<AdminTaxInvestmentCategory>) => {
    const next = [...rows];
    next[index] = { ...next[index], ...patch };
    setDraftRows(next);
  };

  if (isLoading) {
    return <AdminTableSkeleton rows={4} />;
  }

  if (error) {
    return (
      <AdminEmptyState
        description="Refresh the page or check the API connection."
        title="Could not load investment categories"
      />
    );
  }

  return (
    <div className="admin-tax-planner-stack">
      <AdminSection className="admin-section-compact" title="Investment Category Labels">
        <div className="admin-data-table-shell admin-tax-planner-data-shell">
          <div className="admin-data-table admin-data-table-investment">
            <div className="admin-data-table-head">
              <span>Category Code</span>
              <span>Display Name</span>
              <span>Display Order</span>
              <span>Visible</span>
            </div>
            <div className="admin-data-table-body">
              {rows.map((row, index) => (
                <div className="admin-data-table-row" key={row.category_key}>
                  <div className="admin-data-table-cell">
                    <span className="admin-tax-planner-key">{row.category_key}</span>
                  </div>
                  <div className="admin-data-table-cell">
                    <input
                      onChange={(event) => updateRow(index, { display_label: event.target.value })}
                      type="text"
                      value={row.display_label}
                    />
                  </div>
                  <div className="admin-data-table-cell">
                    <input
                      inputMode="numeric"
                      onChange={(event) => updateRow(index, { sort_order: Number(event.target.value) || 0 })}
                      type="text"
                      value={row.sort_order}
                    />
                  </div>
                  <div className="admin-data-table-cell">
                    <input
                      checked={row.is_enabled}
                      onChange={(event) => updateRow(index, { is_enabled: event.target.checked })}
                      type="checkbox"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </AdminSection>

      <div className="admin-tax-planner-sticky-footer">
        <span
          className={
            isDirty ? "admin-tax-planner-action-status admin-tax-planner-action-status-dirty" : "admin-tax-planner-action-status"
          }
        >
          {isDirty ? "Unsaved" : "No changes"}
        </span>
        <button
          className="admin-btn admin-btn-primary"
          disabled={!isDirty || saveMutation.isPending || rows.length === 0}
          onClick={() => saveMutation.mutate()}
          type="button"
        >
          {saveMutation.isPending ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}
