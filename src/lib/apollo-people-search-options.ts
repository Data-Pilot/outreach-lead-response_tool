/**
 * Filter presets aligned with Apollo People API Search (`mixed_people/api_search`).
 * @see https://docs.apollo.io/reference/people-api-search
 */

export type ApolloSelectOption = { value: string; label: string };

/** Documented `person_seniorities[]` values (People API Search). */
export const APOLLO_PERSON_SENIORITIES: ApolloSelectOption[] = [
  { value: "owner", label: "Owner" },
  { value: "founder", label: "Founder" },
  { value: "c_suite", label: "C-suite" },
  { value: "partner", label: "Partner" },
  { value: "vp", label: "VP" },
  { value: "head", label: "Head" },
  { value: "director", label: "Director" },
  { value: "manager", label: "Manager" },
  { value: "senior", label: "Senior (IC)" },
  { value: "entry", label: "Entry" },
  { value: "intern", label: "Intern" },
];

/** Documented `contact_email_status[]` values (exact strings required by Apollo). */
export const APOLLO_CONTACT_EMAIL_STATUSES: ApolloSelectOption[] = [
  { value: "verified", label: "Verified" },
  { value: "unverified", label: "Unverified" },
  { value: "likely_to_engage", label: "Likely to engage" },
  { value: "unavailable", label: "Unavailable" },
];

/**
 * Common `organization_num_employees_ranges[]` bands (comma-separated min,max).
 * Apollo accepts arbitrary ranges; these match typical Apollo UI buckets.
 */
export const APOLLO_EMPLOYEE_RANGE_PRESETS: ApolloSelectOption[] = [
  { value: "", label: "Any company size" },
  { value: "1,10", label: "1–10 employees" },
  { value: "11,20", label: "11–20 employees" },
  { value: "21,50", label: "21–50 employees" },
  { value: "51,100", label: "51–100 employees" },
  { value: "101,200", label: "101–200 employees" },
  { value: "201,500", label: "201–500 employees" },
  { value: "501,1000", label: "501–1,000 employees" },
  { value: "1001,2000", label: "1,001–2,000 employees" },
  { value: "2001,5000", label: "2,001–5,000 employees" },
  { value: "5001,10000", label: "5,001–10,000 employees" },
  { value: "10001,20000", label: "10,001–20,000 employees" },
  { value: "20001,50000", label: "20,001–50,000 employees" },
  { value: "50001,100000", label: "50,001–100,000 employees" },
  { value: "100001,250000", label: "100,001–250,000 employees" },
  { value: "250001,500000", label: "250,001–500,000 employees" },
  { value: "500001,1000000", label: "500,001–1,000,000 employees" },
  { value: "1000001,5000000", label: "1,000,001–5,000,000 employees" },
];

/**
 * People search has no fixed industry enum; presets append a keyword to `q_keywords`.
 * "Any industry" = no extra keyword from this control.
 */
export const INDUSTRY_KEYWORD_PRESETS: string[] = [
  "Any industry",
  "Computer Software",
  "Information Technology & Services",
  "Internet",
  "Financial Services",
  "Banking",
  "Insurance",
  "Investment Management",
  "Hospital & Health Care",
  "Pharmaceuticals",
  "Medical Devices",
  "Biotechnology",
  "Retail",
  "E-Learning",
  "Higher Education",
  "Marketing & Advertising",
  "Management Consulting",
  "Legal Services",
  "Accounting",
  "Real Estate",
  "Construction",
  "Machinery",
  "Automotive",
  "Consumer Electronics",
  "Telecommunications",
  "Oil & Energy",
  "Utilities",
  "Transportation / Trucking / Railroad",
  "Logistics & Supply Chain",
  "Food & Beverages",
  "Hospitality",
  "Entertainment",
  "Media Production",
  "Nonprofit Organization Management",
  "Government Administration",
  "Defense & Space",
  "Semiconductors",
  "Electrical / Electronic Manufacturing",
  "Chemicals",
  "Consumer Goods",
  "Wholesale",
  "Mining & Metals",
  "Aviation & Aerospace",
];
