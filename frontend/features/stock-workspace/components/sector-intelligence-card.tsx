import type { SectorIntelligenceViewModel } from "@/features/stock-workspace/view-models/sector-context-view-model";
import type { StockWorkspaceLanguage } from "@/features/stock-workspace/stock-workspace-language";

type SectorIntelligenceCardProps = {
  sector: SectorIntelligenceViewModel;
  copy: StockWorkspaceLanguage["sector"];
};

function SectorKpi({ label, value, helper, tone }: SectorIntelligenceViewModel["kpis"][number]) {
  return (
    <article className={`sector-intelligence-kpi sector-intelligence-kpi-${tone}`}>
      <span className="sector-intelligence-kpi-label">{label}</span>
      <strong className="sector-intelligence-kpi-value">{value}</strong>
      {helper ? <small className="sector-intelligence-kpi-helper">{helper}</small> : null}
    </article>
  );
}

function PerformerHighlight({
  title,
  performer,
}: {
  title: string;
  performer: NonNullable<SectorIntelligenceViewModel["topPerformer"]>;
}) {
  return (
    <article className={`sector-performer-highlight sector-performer-highlight-${performer.tone}`}>
      <span className="sector-performer-highlight-label">{title}</span>
      <div className="sector-performer-highlight-body">
        <strong>{performer.symbol}</strong>
        <span>{performer.changePercent}</span>
      </div>
    </article>
  );
}

export function SectorIntelligenceCard({ sector, copy }: SectorIntelligenceCardProps) {
  return (
    <div className="sector-intelligence-card">
      <header className="sector-intelligence-header">
        <div className="sector-intelligence-title-block">
          <div className="sector-intelligence-title-row">
            <h3>{sector.sectorName}</h3>
            <span className="sector-intelligence-count">{copy.stocks(sector.stockCount)}</span>
          </div>
          {sector.headline ? (
            <p className="sector-intelligence-headline">
              {copy.headline(sector.sectorName, sector.stockCount, sector.headlineFacts)}
            </p>
          ) : null}
        </div>
      </header>

      {sector.kpis.length ? (
        <div className="sector-intelligence-kpi-grid">
          {sector.kpis.map((kpi) => (
            <SectorKpi
              helper={
                kpi.helperKind === "trend" && kpi.helperValue
                  ? copy.trendHelper(kpi.helperValue)
                  : kpi.helperKind === "comparison" && kpi.helperValue && kpi.helperRelation
                    ? copy.comparisonHelper(kpi.helperValue, kpi.helperRelation)
                    : kpi.helper
              }
              key={kpi.key}
              label={copy.kpiLabels[kpi.key] ?? kpi.label}
              tone={kpi.tone}
              value={kpi.value}
            />
          ))}
        </div>
      ) : null}

      {sector.topPerformer || sector.worstPerformer ? (
        <div className="sector-performer-row">
          {sector.topPerformer ? <PerformerHighlight performer={sector.topPerformer} title={copy.leader} /> : null}
          {sector.worstPerformer ? <PerformerHighlight performer={sector.worstPerformer} title={copy.laggard} /> : null}
        </div>
      ) : null}

      {sector.achievements.length ? (
        <div className="sector-intelligence-achievements">
          {sector.achievements.map((achievement) => (
            <span className="sector-intelligence-achievement" key={`${achievement.key}-${achievement.rank ?? ""}`}>
              {copy.achievement(achievement.key, achievement.rank)}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
