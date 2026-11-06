import type { RulePack, SourceDocument, SourceReference } from "./contracts";
import type { Text } from "./fields";

export function sourceHref(source: SourceDocument, reference?: SourceReference) {
  const url = source.public_url.split("#")[0];
  const page = reference?.public_pdf_pages?.[0];
  return page ? url + "#page=" + page : url;
}

export function RuleSources({ rules, ruleId, t, provision }: { rules: RulePack; ruleId: string; t: Text; provision?: string }) {
  const references = rules.rule_references.find((rule) => rule.id === ruleId)?.references ?? [];
  return <>{references.filter((ref) => !provision || ref.provision.includes(provision)).map((ref) => {
    const source = rules.sources.find(({ id }) => id === ref.document_id);
    if (!source) return null;
    return <span key={ref.document_id + ":" + ref.provision}>
      <a href={sourceHref(source, ref)} target="_blank" rel="noreferrer">{ref.provision}</a>
      {" · "}{source.public_edition ?? (ref.public_pdf_pages?.length ? source.edition : t("Official PDF", "সরকারি পিডিএফ"))}
      {" · "}{t("Evidence PDF pages", "যাচাইকৃত পিডিএফ পৃষ্ঠা")}: {ref.pdf_pages.join(", ")}
      {" ("}{source.edition}{")"}
    </span>;
  })}</>;
}
