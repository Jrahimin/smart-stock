import type { SectorIntelligenceViewModel } from "@/features/stock-workspace/view-models/sector-context-view-model";

type SectorIntelligenceCardProps = {
  sector: SectorIntelligenceViewModel;
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

export function SectorIntelligenceCard({ sector }: SectorIntelligenceCardProps) {
  return (
    <div className="sector-intelligence-card">
      <header className="sector-intelligence-header">
        <div className="sector-intelligence-title-block">
          <div className="sector-intelligence-title-row">
            <h3>{sector.sectorName}</h3>
            <span className="sector-intelligence-count">{sector.stockCount} stocks</span>
          </div>
          {sector.headline ? <p className="sector-intelligence-headline">{sector.headline}</p> : null}
        </div>
      </header>

      {sector.kpis.length ? (
        <div className="sector-intelligence-kpi-grid">
          {sector.kpis.map((kpi) => (
            <SectorKpi helper={kpi.helper} key={kpi.key} label={kpi.label} tone={kpi.tone} value={kpi.value} />
          ))}
        </div>
      ) : null}

      {sector.topPerformer || sector.worstPerformer ? (
        <div className="sector-performer-row">
          {sector.topPerformer ? <PerformerHighlight performer={sector.topPerformer} title="Leader" /> : null}
          {sector.worstPerformer ? <PerformerHighlight performer={sector.worstPerformer} title="Laggard" /> : null}
        </div>
      ) : null}

      {sector.achievements.length ? (
        <div className="sector-intelligence-achievements">
          {sector.achievements.map((achievement) => (
            <span className="sector-intelligence-achievement" key={achievement}>
              {achievement}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
