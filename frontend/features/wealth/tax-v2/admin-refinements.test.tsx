/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import {cleanup,fireEvent,render,screen,within} from "@testing-library/react";
import {afterEach,expect,it,vi} from "vitest";
import {RuleEditor} from "./rule-editor";
import {config} from "./test-fixtures";
afterEach(cleanup);

it("derives cumulative bands without editing their stored widths",()=>{
 const rules=config().selected!.rules, before=JSON.stringify(rules), changed=vi.fn();
 render(<RuleEditor rules={rules} onChange={changed} disabled readOnly/>);
 expect(screen.getByText("Above BDT 400,000 to BDT 700,000")).toBeVisible();
 expect(JSON.stringify(rules)).toBe(before);expect(changed).not.toHaveBeenCalled();
});
it("opens edition-specific evidence with readable names and restores focus",()=>{
 const rules=structuredClone(config().selected!.rules);
 rules.sources=[{id:"supplied",edition:"Supplied guide",public_url:"https://nbr.gov.bd/guide.pdf",sha256:"a".repeat(64)},{id:"linked",edition:"Different press edition",public_url:"https://nbr.gov.bd/guide.pdf",sha256:"b".repeat(64)}];
 rules.rule_references=[{id:"profile.allowance",effective_basis:"assessment_year",policy_id:"allowance",supported_facts:[],golden_cases:[],references:[{document_id:"supplied",provision:"Allowance; printed page 54",pdf_pages:[62],public_pdf_pages:[70]}]}];
 render(<RuleEditor rules={rules} onChange={vi.fn()} disabled readOnly/>);
 const trigger=screen.getByRole("button",{name:"View evidence · 1 rule · 1 citation"});trigger.focus();fireEvent.click(trigger);
 const panel=screen.getByRole("dialog",{name:"Rule evidence"});
 expect(within(panel).getByRole("heading",{name:"Tax-free allowances"})).toBeVisible();
 expect(within(panel).getByText("54")).toBeVisible();expect(within(panel).getByText("62")).toBeVisible();
 expect(within(panel).getByRole("link",{name:"Open linked document ↗"})).toHaveAttribute("href","https://nbr.gov.bd/guide.pdf#page=70");
 fireEvent.keyDown(document,{key:"Escape"});expect(trigger).toHaveFocus();
});
it("counts category results and clears both search and visibility filters",()=>{
 render(<RuleEditor rules={config().selected!.rules} onChange={vi.fn()} disabled readOnly section="Labels & visibility"/>);
 fireEvent.change(screen.getByLabelText("Category visibility"),{target:{value:"hidden"}});
 expect(screen.getByText("1 of 2 categories")).toBeVisible();
 fireEvent.change(screen.getByLabelText("Search categories"),{target:{value:"no match"}});
 expect(screen.getByText("0 of 2 categories")).toBeVisible();fireEvent.click(screen.getByRole("button",{name:"Clear filters"}));
 expect(screen.getByText("2 of 2 categories")).toBeVisible();
});
it("uses a single availability state for an unsupported filing year",()=>{
 render(<RuleEditor rules={config("2027-28").selected!.rules} onChange={vi.fn()} disabled readOnly section="Filing calendar"/>);
 expect(screen.getByRole("heading",{name:"Filing balance unavailable for AY 2027-28"})).toBeVisible();
 expect(screen.queryByRole("table")).not.toBeInTheDocument();expect(screen.queryByRole("button",{name:"Add filing window"})).not.toBeInTheDocument();
});

it("does not invent ranges for unfinished bands or subsequent bands",()=>{
 const rules=structuredClone(config().selected!.rules);rules.taxable_bands[0].width="";
 render(<RuleEditor rules={rules} onChange={vi.fn()} disabled={false} section="Tax rules"/>);
 expect(screen.getAllByText("Enter a band width to calculate the range").length).toBeGreaterThan(1);
 expect(screen.queryByText("Above BDT 400,000 to BDT 400,000")).not.toBeInTheDocument();
});
it("explains recipient searches with no results",()=>{
 render(<RuleEditor rules={config().selected!.rules} onChange={vi.fn()} disabled readOnly section="Investments & rebate"/>);
 fireEvent.change(screen.getByLabelText("Search approved recipients"),{target:{value:"no matching recipient"}});
 expect(screen.getByRole("status")).toHaveTextContent("No recipients match your search");
});
