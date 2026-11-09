import type { CSSProperties } from "react";
import type { AppLocale } from "@/lib/locale/app-locale";
import type { Income, RulePack, TaxResult } from "./contracts";
import { bdt, translator } from "./fields";
import { hasMoney } from "./facts";
import { usableBase, sumMoney, effectiveRebateBeforeMinimum, type EstimatePresentation } from "./planner-template";
import { RebateDetails } from "./rebate-details";
import { TaxInfoTooltip } from "@/features/wealth/components/tax-info-tooltip";
import css from "./journey.module.css";

export function TaxJourney({result,locale,rules,onExploreSavings,onShowDetails,presentation}: {result:TaxResult;locale:AppLocale;rules?:RulePack;incomeFacts?:Income[];onExploreSavings?:()=>void;onShowDetails?:()=>void;presentation?:EstimatePresentation}) {
 const t=translator(locale), b=result.base, available=usableBase(b);
 const money=(v:string|null|undefined)=>v==null?"—":bdt(v,locale);
 const total=sumMoney(b.income.map(r=>r.entered_amount));
 const exempt=sumMoney(b.income.map(r=>r.excluded_amount));
 const deductions=sumMoney([...b.income.map(r=>r.deductible_amount),...b.income_deductions.map(r=>r.allowed_amount)]);
 const after=sumMoney([b.ordinary_income,b.special_rate_income]);
 const special=hasMoney(b.special_rate_income), topUp=hasMoney(b.minimum_tax_top_up??"0");
 const rebate=effectiveRebateBeforeMinimum(b);
 const potential=b.rebate.potential_additional_tax_saving, extra=b.rebate.additional_eligible_investment_for_lowest_usable_liability;
 const fresh=available && (!presentation?.freshness || presentation.freshness==="current");
 const opportunity=fresh && potential!=null && extra!=null && hasMoney(potential) && hasMoney(extra);
 const noSaving=fresh && potential!=null && !hasMoney(potential);
 const rate=available && Number(after)>0?new Intl.NumberFormat(locale==="bn"?"bn-BD":"en-BD",{maximumFractionDigits:2}).format(Number(b.annual_liability)/Number(after)*100)+"%":"—";
 const row=(label:string,value:string|null|undefined,reduce=false)=> <div className={css.row}><span>{label}</span><strong className={reduce?css.reduction:undefined}>{reduce&&value!=null?"− ":""}{money(value)}</strong></div>;
 const art=(name:string)=> <img src={"/wealth/tax-journey/"+name+".png"} alt="" aria-hidden="true" width="90" height="90"/>;
 const number=(n:number)=>new Intl.NumberFormat(locale==="bn"?"bn-BD":"en-BD").format(n);
 return <section id="tax-journey" tabIndex={-1} className={css.journey} aria-label={t("Tax Journey","Tax Journey")}>
   <header className={css.heading}><div><p>TAX JOURNEY</p><h2>{t("From income to Tax, in three simple steps","আয় থেকে Tax, সহজে তিন ধাপে")}</h2><span>{presentation?.provenance==="example"?t("Example · ","নমুনা হিসাব · "):presentation?.provenance==="restored"?t("Restored estimate · ","ফিরিয়ে আনা হিসাব · "):""}{t("Based on your current facts","আপনার বর্তমান তথ্য অনুযায়ী")}</span></div><span className={css.current}>{!available?t("Review facts","তথ্য যাচাই প্রয়োজন"):presentation?.freshness==="updating"?t("Updating…","হালনাগাদ হচ্ছে…"):presentation?.freshness==="last"?t("Last calculation","শেষ হিসাব"):t("Current calculation","বর্তমান হিসাব")}</span></header>
   <div className={css.surface}>
    <div className={css.stages} role="region" aria-label={t("Tax journey steps","করের হিসাবের ধাপ")}>
     <article className={css.stage}>
      <h3>{art("wallet")}<span>{number(1)} · {t("Income calculation","আয়ের হিসাব")}</span></h3>
      <div className={css.lines}>{row(t("Total income","মোট আয়"),total)}{hasMoney(exempt)&&hasMoney(deductions)?<>{row(t("Exempt income","করমুক্ত আয়"),exempt,true)}{row(t("Allowed deductions","অনুমোদিত বিয়োজন"),deductions,true)}</>:row(t("Income exemptions & deductions","আয়ের ছাড়"),sumMoney([exempt,deductions]),true)}</div>
      <div className={css.subtotal}>{row(t("Income after deductions","ছাড়ের পর আয়"),after)}</div><span className={css.connector} aria-hidden="true">⟶</span>
     </article>
     <article className={css.stage}>
      <h3>{art("shield")}<span>{number(2)} · {t("Tax basis","Tax-এর ভিত্তি")}</span></h3>
      <div className={css.lines}>{row(special?t("Ordinary income","সাধারণ আয়"):t("Income after deductions","ছাড়ের পর আয়"),special?b.ordinary_income:after)}{row(t("Tax-free threshold","করমুক্ত সীমা"),b.allowance,true)}{special&&row(t("Separate-rate income","আলাদা হারের আয়"),b.special_rate_income)}</div>
      <div className={css.subtotal}>{row(special?t("Ordinary income above threshold","সীমার বেশি সাধারণ আয়"):t("Income for Tax calculation","Tax হিসাবের আয়"),b.ordinary_income_above_allowance)}</div><span className={css.connector} aria-hidden="true">⟶</span>
     </article>
     <article className={css.receipt}>
      <div className={css.paper}>
       <h3>{art("document-calculator")}<span>{number(3)} · {t("Your Tax","আপনার Tax")}</span></h3>
       <div className={css.lines}>{row(t("Tax before rebate","রেয়াতের আগে Tax"),b.gross_tax)}<div className={css.rebateRow}>{row(t("Applied rebate","প্রযোজ্য রেয়াত"),rebate,true)}<RebateDetails base={b} rules={rules} locale={locale}/></div>{special&&<small>{t("Includes separate-rate Tax: ","আলাদা হারের Tax অন্তর্ভুক্ত: ")}{money(b.special_tax)}</small>}{topUp&&<>{row(t("Tax after rebate","রেয়াতের পর Tax"),b.post_rebate_tax)}{row(t("Minimum-Tax adjustment","ন্যূনতম Tax সমন্বয়"),b.minimum_tax_top_up)}</>}{hasMoney((b.rebate.liability_rounding_adjustment??"0").replace(/^-/ ,""))&&row(t("Rounding adjustment","পূর্ণ টাকায় সমন্বয়"),b.rebate.liability_rounding_adjustment)}</div>
       <div className={css.final} style={{"--journey-amount-length":money(available?b.annual_liability:null).length} as CSSProperties}><h4>{t("Estimated annual Tax","আনুমানিক বার্ষিক Tax")}</h4><strong>{available?money(b.annual_liability):"—"}</strong></div>
      </div>
     </article>
    </div>
    <footer className={css.footer}><span>{t("Applied Tax saving ","বর্তমান রেয়াতে সাশ্রয় ")}<b className={css.reduction}>{money(available?b.rebate.effective_tax_reduction:null)}</b></span><span>{t("Effective Tax rate ","কার্যকর Tax হার ")}<b>{rate}</b> <TaxInfoTooltip ariaLabel={t("About effective Tax rate","কার্যকর Tax হার সম্পর্কে")} >{t("Annual liability divided by income after source deductions, before the personal threshold. Statutory rebate may differ from the usable Tax saving after minimum Tax.","আয়ের ছাড়ের পর ও ব্যক্তিগত করমুক্ত সীমার আগে আয়ের তুলনায় বার্ষিক করদায়। ন্যূনতম Tax-এর কারণে আইনি রেয়াত ও ব্যবহারযোগ্য সাশ্রয় আলাদা হতে পারে।")}</TaxInfoTooltip></span><button type="button" onClick={onShowDetails}>{t("View calculation details","বিস্তারিত হিসাব দেখুন")} ↗</button></footer>
   </div>
   <aside className={css.opportunity} aria-label={t("Savings opportunity","সাশ্রয়ের সুযোগ")}>
    {art("saving-slip")}<div className={css.opportunityBody}><h3>{opportunity?t("Your next opportunity","আপনার পরের সুযোগ"):noSaving?t("Your saving limit is reached","আপনার সাশ্রয়ের সীমা পূর্ণ"):t("Review your savings opportunity","সাশ্রয়ের সুযোগ যাচাই করুন")}</h3><div className={css.opportunityValues}><div><span>{t("Additional eligible Investment","আরও যোগ্য Investment")}</span><strong>{noSaving?t("Not needed","প্রয়োজন নেই"):money(opportunity?extra:null)}</strong></div><span className={css.bandArrow} aria-hidden="true">⟶</span><div><span>{t("Potential additional saving","সম্ভাব্য অতিরিক্ত সাশ্রয়")}</span><strong className={css.reduction}>{money(opportunity?potential:noSaving?"0":null)}</strong></div></div><p>{opportunity?t("This potential saving is not included in your current Tax calculation.","এই সম্ভাব্য সাশ্রয় বর্তমান Tax-এর হিসাবে ধরা হয়নি।"):noSaving?t("Further Investment brings no additional Tax saving under these facts.","এই তথ্যে আরও Investment-এ অতিরিক্ত Tax সাশ্রয় হবে না।"):t("Review the current facts and eligibility before comparing additional Investment.","অতিরিক্ত Investment তুলনার আগে বর্তমান তথ্য ও যোগ্যতা যাচাই করুন।")}</p></div><button type="button" onClick={onExploreSavings}>{t("Compare Investment","Investment তুলনা করুন")} ↗</button>
   </aside>
 </section>;
}
