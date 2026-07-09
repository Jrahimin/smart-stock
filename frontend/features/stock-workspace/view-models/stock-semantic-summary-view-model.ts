import type { StockDecisionViewModel } from "@/features/stock-workspace/view-models/stock-decision-view-model";
import type { StockWorkspaceModel } from "@/features/stock-workspace/view-models/stock-workspace-view-model";
import { formatMarketCapBdt } from "@/lib/formatters/financial-formatters";

function resolveAction(decision: StockDecisionViewModel) {
  if (decision.available && decision.recommendation !== "—") {
    return decision.recommendation;
  }

  return null;
}

function resolveConfidence(decision: StockDecisionViewModel) {
  if (decision.available && decision.confidence > 0) {
    return decision.confidence;
  }

  return null;
}

function resolveMarketCapPhrase(model: StockWorkspaceModel, decision: StockDecisionViewModel) {
  if (model.header.marketCap && model.header.marketCap !== "—" && model.header.marketCap !== "N/A") {
    return `Current market cap is BDT ${model.header.marketCap}`;
  }

  const marketCapValue = decision.valuation?.market_cap ?? model.intelligence?.stock.market_cap;
  const formatted = formatMarketCapBdt(marketCapValue);
  if (formatted === "N/A") {
    return null;
  }

  return `Current market cap is BDT ${formatted}`;
}

export function buildStockSemanticSummary(model: StockWorkspaceModel, decision: StockDecisionViewModel): string {
  const symbol = model.header.symbol;
  const sector = model.header.sector;
  const exchange = model.header.exchange;
  const action = resolveAction(decision);
  const confidence = resolveConfidence(decision);
  const marketCapPhrase = resolveMarketCapPhrase(model, decision);

  const introSector = sector && sector !== "Unclassified" ? `a ${sector}` : "a listed";
  const parts = [`${symbol} is ${introSector} company listed on ${exchange}.`];

  if (marketCapPhrase) {
    parts.push(`${marketCapPhrase}.`);
  }

  if (action) {
    if (confidence !== null && confidence > 0) {
      parts.push(
        `Decision support currently shows ${action} with ${confidence}% model confidence (not investment advice).`,
      );
    } else {
      parts.push(`Decision support currently shows ${action} (not investment advice).`);
    }
  }

  if (decision.available && decision.freshness.label) {
    parts.push(`Market data status: ${decision.freshness.label} (${decision.freshness.helper}).`);
  }

  return parts.join(" ");
}
