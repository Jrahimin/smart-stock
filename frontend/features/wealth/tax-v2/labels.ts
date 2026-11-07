import type { Coverage, Income } from "./contracts";

export const incomeNames: Record<Income["kind"], [string, string]> = {
  private_employment: ["Private employment", "বেসরকারি চাকরি"], government_employment: ["Government employment", "সরকারি চাকরি"],
  ordinary_other: ["Other ordinary taxable income", "অন্যান্য সাধারণ করযোগ্য আয়"], ordinary_rent: ["Rental income", "ভাড়া থেকে আয়"],
  ordinary_business: ["Business or professional income", "ব্যবসা বা পেশার আয়"], bank_interest: ["Bank interest", "ব্যাংক সুদ"],
  fdr_profit: ["FDR profit", "এফডিআরের মুনাফা"], dps_profit: ["DPS profit", "ডিপিএসের মুনাফা"],
  savings_certificate_profit: ["Savings certificate profit", "সঞ্চয়পত্রের মুনাফা"], domestic_dividend: ["Domestic dividend", "দেশীয় লভ্যাংশ"],
  listed_gain: ["Realized listed capital gains", "তালিকাভুক্ত সম্পদ বিক্রির লাভ"], foreign: ["Foreign or treaty income", "বিদেশি বা চুক্তিভুক্ত আয়"],
  conditional_exemption: ["Income with a conditional exemption", "শর্তসাপেক্ষ অব্যাহতির আয়"], property_gain: ["Property gain", "সম্পত্তি বিক্রির লাভ"],
  precious_metal_gain: ["Precious metal gain", "মূল্যবান ধাতু বিক্রির লাভ"], partnership_or_aop: ["Partnership or association income", "অংশীদারি বা সংঘের আয়"],
  final_tax: ["Income subject to final tax", "চূড়ান্ত করের আওতাধীন আয়"], restricted_tax: ["Income subject to restricted tax credit", "সীমিত কর সমন্বয়ের আয়"],
  unclassified: ["Income that needs classification", "শ্রেণি নির্ধারণ প্রয়োজন এমন আয়"],
};
export const coverageNames: Record<keyof Coverage, [string, string]> = {
  wealth_surcharge: ["Could wealth surcharge apply?", "সম্পদের সারচার্জ প্রযোজ্য হতে পারে?"],
  environmental_surcharge: ["Could environmental surcharge apply?", "পরিবেশ সারচার্জ প্রযোজ্য হতে পারে?"],
  personal_vehicle_advance_tax: ["Is there personal vehicle advance tax?", "ব্যক্তিগত গাড়ির অগ্রিম কর আছে?"],
  commercial_vehicle_or_vessel: ["Does commercial vehicle or vessel income apply?", "বাণিজ্যিক গাড়ি বা নৌযানের আয় আছে?"],
  foreign_or_treaty_income: ["Is there foreign or treaty income?", "বিদেশি বা করচুক্তির আয় আছে?"],
  unresolved_special_income: ["Is there another exemption or special income still to review?", "অন্য কোনো অব্যাহতি বা বিশেষ আয় যাচাই করা বাকি?"],
  losses_or_setoff: ["Are losses or loss offsets claimed?", "ক্ষতি বা ক্ষতির সমন্বয় দাবি করা হচ্ছে?"],
  turnover_or_special_sector: ["Could turnover or special sector tax apply?", "টার্নওভার বা বিশেষ খাতের কর প্রযোজ্য হতে পারে?"],
  prior_rebate_recovery: ["Could an earlier rebate be recovered?", "আগের রেয়াত ফেরত দিতে হতে পারে?"],
  other_part2_donation_claims: ["Are there other Part 2 donation claims?", "দ্বিতীয় অংশের অন্য কোনো অনুদান দাবি আছে?"],
};
