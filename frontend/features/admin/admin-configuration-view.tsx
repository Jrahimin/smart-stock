"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import {
  ADMIN_CONFIG_CATEGORY_LABELS,
  getConfigMeta,
} from "@/features/admin/components/admin-config-meta";
import {
  AdminEmptyState,
  AdminSection,
} from "@/features/admin/components/admin-data-table";
import { AdminPageHeader } from "@/features/admin/components/admin-page-header";
import { AdminTableSkeleton } from "@/features/admin/components/admin-skeleton";
import { SuperAdminRoute } from "@/features/auth/components/admin-route";
import type { AdminConfigCategory, AdminConfigSetting } from "@/features/admin/types/admin-types";
import { fetchAdminConfiguration, updateAdminConfiguration } from "@/lib/api/admin-api";

const CATEGORY_ORDER: AdminConfigCategory[] = ["MARKET", "SYSTEM", "FEATURE_FLAG", "EMAIL", "SCRAPER"];

export function AdminConfigurationView() {
  return (
    <SuperAdminRoute>
      <AdminConfigurationContent />
    </SuperAdminRoute>
  );
}

function AdminConfigurationContent() {
  const queryClient = useQueryClient();
  const [draftValues, setDraftValues] = useState<Record<string, string>>({});
  const [activeCategory, setActiveCategory] = useState<AdminConfigCategory>("MARKET");
  const { data, isLoading, error, dataUpdatedAt } = useQuery({
    queryKey: ["admin-configuration"],
    queryFn: fetchAdminConfiguration,
  });

  const saveMutation = useMutation({
    mutationFn: async (entries: Array<{ key: string; value: string }>) => {
      await Promise.all(entries.map(({ key, value }) => updateAdminConfiguration(key, value)));
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-configuration"] });
    },
  });

  const grouped = useMemo(() => {
    const map = new Map<AdminConfigCategory, AdminConfigSetting[]>();
    for (const setting of data ?? []) {
      const items = map.get(setting.category) ?? [];
      items.push(setting);
      map.set(setting.category, items);
    }
    return map;
  }, [data]);

  const categories = CATEGORY_ORDER.filter((category) => (grouped.get(category)?.length ?? 0) > 0);
  const activeSettings = grouped.get(activeCategory) ?? [];

  const pendingChanges = useMemo(
    () =>
      activeSettings
        .map((setting) => ({
          key: setting.key,
          value: draftValues[setting.key] ?? setting.value,
        }))
        .filter((entry, index) => entry.value !== activeSettings[index]?.value),
    [activeSettings, draftValues],
  );

  useEffect(() => {
    if (categories.length > 0 && !categories.includes(activeCategory)) {
      setActiveCategory(categories[0]);
    }
  }, [activeCategory, categories]);

  const saveCategory = async () => {
    if (!pendingChanges.length) {
      return;
    }

    await saveMutation.mutateAsync(pendingChanges);
    setDraftValues((current) => {
      const next = { ...current };
      for (const entry of pendingChanges) {
        delete next[entry.key];
      }
      return next;
    });
  };

  return (
    <div className="admin-workspace workspace-page-stack">
      <AdminPageHeader
        description="Safe runtime operational settings. Secrets remain environment-only."
        lastUpdated={data ? new Date(dataUpdatedAt).toISOString() : null}
        title="Configuration"
      />

      {isLoading ? <AdminTableSkeleton rows={4} /> : null}
      {error ? <section className="placeholder-panel">Failed to load configuration.</section> : null}

      {data ? (
        <AdminSection
          description="Grouped operational controls with friendly labels and typed inputs."
          title="Runtime Settings"
        >
          <div className="admin-config-tabs" role="tablist">
            {categories.map((category) => (
              <button
                aria-selected={activeCategory === category}
                className={activeCategory === category ? "admin-config-tab admin-config-tab-active" : "admin-config-tab"}
                key={category}
                onClick={() => setActiveCategory(category)}
                role="tab"
                type="button"
              >
                {ADMIN_CONFIG_CATEGORY_LABELS[category]}
              </button>
            ))}
          </div>

          {activeSettings.length ? (
            <div className="admin-config-list">
              {activeSettings.map((setting) => {
                const value = draftValues[setting.key] ?? setting.value;
                const meta = getConfigMeta(setting.key, setting.value_type);
                const isDirty = value !== setting.value;

                return (
                  <article className={`admin-config-item ${isDirty ? "admin-config-item-dirty" : ""}`} key={setting.key}>
                    <div className="admin-config-copy">
                      <strong>{meta.label}</strong>
                      <p>
                        {setting.description}
                        {setting.requires_restart ? " · Requires restart after save." : ""}
                      </p>
                      <span className="admin-config-key">
                        {setting.key} · source: {setting.source}
                      </span>
                    </div>

                    <div className="admin-config-control">
                      {meta.control === "toggle" ? (
                        <button
                          aria-pressed={value === "true"}
                          className={value === "true" ? "admin-toggle admin-toggle-on" : "admin-toggle"}
                          onClick={() =>
                            setDraftValues((current) => ({
                              ...current,
                              [setting.key]: value === "true" ? "false" : "true",
                            }))
                          }
                          type="button"
                        >
                          <span className="admin-toggle-thumb" />
                        </button>
                      ) : (
                        <input
                          className="admin-config-input"
                          onChange={(event) =>
                            setDraftValues((current) => ({ ...current, [setting.key]: event.target.value }))
                          }
                          type={meta.control === "number" ? "number" : meta.control === "time" ? "time" : "text"}
                          value={value}
                        />
                      )}
                      {meta.unit ? <span className="admin-config-key">{meta.unit}</span> : null}
                    </div>
                  </article>
                );
              })}

              <div className="admin-config-footer">
                <span className="admin-config-key">
                  {pendingChanges.length
                    ? `${pendingChanges.length} unsaved change${pendingChanges.length === 1 ? "" : "s"}`
                    : "No unsaved changes"}
                </span>
                <button
                  className="admin-btn admin-btn-primary"
                  disabled={!pendingChanges.length || saveMutation.isPending}
                  onClick={() => void saveCategory()}
                  type="button"
                >
                  Save {ADMIN_CONFIG_CATEGORY_LABELS[activeCategory]}
                </button>
              </div>
            </div>
          ) : (
            <AdminEmptyState description="No settings are exposed for this category." title="No configuration items" />
          )}
        </AdminSection>
      ) : null}
    </div>
  );
}
