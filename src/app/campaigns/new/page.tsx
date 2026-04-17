"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { X, ChevronDown, ChevronUp } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { BulkActionBar } from "@/components/ui/bulk-action-bar";
import {
  APOLLO_CONTACT_EMAIL_STATUSES,
  APOLLO_EMPLOYEE_RANGE_PRESETS,
  INDUSTRY_KEYWORD_PRESETS,
} from "@/lib/apollo-people-search-options";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LeadRow = {
  _id?: string;
  apollo_person_id?: string;
  name: string;
  role: string;
  company: string;
  email: string | null;
  phone?: string;
  location: string;
  linkedin_url?: string;
};

type ApolloResponse = {
  campaign_id?: string;
  leads?: LeadRow[];
  total_count?: number;
  current_page?: number;
  has_more?: boolean;
};

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

function useTagInput(initial: string[] = []) {
  const [tags, setTags] = useState<string[]>(initial);
  const [input, setInput] = useState("");

  const add = () => {
    const v = input.trim();
    if (!v) return;
    setTags((prev) => (prev.includes(v) ? prev : [...prev, v]));
    setInput("");
  };

  /** Add a formatted value (e.g. from location autocomplete) without using `input`. */
  const addRaw = (value: string) => {
    const v = value.trim();
    if (!v) return;
    setTags((prev) => (prev.includes(v) ? prev : [...prev, v]));
    setInput("");
  };

  const remove = (value: string) => {
    setTags((prev) => prev.filter((t) => t !== value));
  };

  return { tags, setTags, input, setInput, add, addRaw, remove };
}

// ---------------------------------------------------------------------------
// Small components
// ---------------------------------------------------------------------------

function FilterSection({
  label,
  badge,
  children,
  defaultOpen = true,
}: {
  label: string;
  badge?: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-border last:border-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between py-3 text-sm font-medium hover:text-primary"
      >
        <span className="flex items-center gap-2">
          {label}
          {badge != null && badge > 0 && (
            <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold leading-none text-primary-foreground">
              {badge}
            </span>
          )}
        </span>
        {open ? <ChevronUp className="size-3.5 text-muted-foreground" /> : <ChevronDown className="size-3.5 text-muted-foreground" />}
      </button>
      {open && <div className="pb-4">{children}</div>}
    </div>
  );
}

function TagInput({
  value,
  onChange,
  onAdd,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  onAdd: () => void;
  placeholder: string;
}) {
  return (
    <div className="flex gap-2">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            onAdd();
          }
        }}
        placeholder={placeholder}
        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
      />
      <Button type="button" variant="outline" size="sm" onClick={onAdd} className="shrink-0 px-3">
        Add
      </Button>
    </div>
  );
}

type LocationSuggestion = { apollo_value: string; label: string };

function LocationSuggestInput({
  input,
  onChangeInput,
  onAddManual,
  onPickSuggestion,
}: {
  input: string;
  onChangeInput: (v: string) => void;
  onAddManual: () => void;
  onPickSuggestion: (apolloValue: string) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<LocationSuggestion[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    const q = input.trim();
    if (q.length < 2) {
      setItems([]);
      setFetchError(null);
      return;
    }
    const t = window.setTimeout(async () => {
      setLoading(true);
      setFetchError(null);
      try {
        const res = await fetch(
          `/api/location-suggest?q=${encodeURIComponent(q)}`
        );
        const data = (await res.json()) as {
          suggestions?: LocationSuggestion[];
          error?: string;
        };
        if (!res.ok || data.error) {
          setItems([]);
          setFetchError(data.error ?? `Request failed (${res.status})`);
          setOpen(true);
          return;
        }
        setItems(
          Array.isArray(data.suggestions) ? data.suggestions : []
        );
        setOpen(true);
      } catch {
        setItems([]);
        setFetchError("Could not reach location search.");
        setOpen(true);
      } finally {
        setLoading(false);
      }
    }, 400);
    return () => window.clearTimeout(t);
  }, [input]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const listboxId = "location-suggest-listbox";

  return (
    <div ref={wrapRef} className="relative">
      <div
        className="flex gap-2"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={listboxId}
      >
        <input
          value={input}
          onChange={(e) => {
            onChangeInput(e.target.value);
            if (e.target.value.trim().length >= 2) setOpen(true);
          }}
          onFocus={() => {
            if (input.trim().length >= 2 && items.length > 0) setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              onAddManual();
              setOpen(false);
            }
          }}
          placeholder="Search place, then pick a suggestion"
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          autoComplete="off"
          aria-autocomplete="list"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            onAddManual();
            setOpen(false);
          }}
          className="shrink-0 px-3"
        >
          Add
        </Button>
      </div>
      {open && (items.length > 0 || loading || fetchError) && (
        <ul
          id={listboxId}
          className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-md border border-border bg-popover py-1 text-sm shadow-md"
          role="listbox"
        >
          {fetchError && !loading && (
            <li className="px-3 py-2 text-destructive">{fetchError}</li>
          )}
          {loading && items.length === 0 && !fetchError && (
            <li className="px-3 py-2 text-muted-foreground">Searching…</li>
          )}
          {items.map((s) => (
            <li key={s.apollo_value}>
              <button
                type="button"
                role="option"
                aria-selected={false}
                className="flex w-full flex-col gap-0.5 px-3 py-2 text-left hover:bg-muted"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onPickSuggestion(s.apollo_value);
                  setOpen(false);
                }}
              >
                <span className="font-medium text-foreground">{s.apollo_value}</span>
                <span className="line-clamp-2 text-xs text-muted-foreground">
                  {s.label}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TagList({ tags, onRemove }: { tags: string[]; onRemove: (t: string) => void }) {
  if (tags.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {tags.map((t) => (
        <span
          key={t}
          className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
        >
          {t}
          <button
            type="button"
            onClick={() => onRemove(t)}
            className="rounded-full hover:text-destructive"
            aria-label={`Remove ${t}`}
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
    </div>
  );
}

function CheckboxGroup({
  options,
  selected,
  onChange,
}: {
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const toggle = (value: string) => {
    onChange(
      selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value]
    );
  };
  return (
    <div className="space-y-1.5">
      {options.map((opt) => (
        <label
          key={opt.value}
          className="flex cursor-pointer items-center gap-2.5 rounded-md px-1 py-1 text-sm hover:bg-muted"
        >
          <input
            type="checkbox"
            checked={selected.includes(opt.value)}
            onChange={() => toggle(opt.value)}
            className="accent-primary"
          />
          {opt.label}
        </label>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const FLOW_STEPS = [
  { n: 1, label: "Fetch Leads", hint: "Set filters and click Fetch Leads" },
  { n: 2, label: "Enrich", hint: "Select leads, then Enrich to reveal emails" },
  { n: 3, label: "Generate & Send", hint: "Generate messages, then push to Instantly" },
];

function FlowStepper({ step }: { step: 1 | 2 | 3 }) {
  return (
    <div className="flex items-center gap-0">
      {FLOW_STEPS.map((s, i) => {
        const done = step > s.n;
        const active = step === s.n;
        return (
          <div key={s.n} className="flex items-center">
            <div className="flex flex-col items-center gap-1" title={s.hint}>
              <div
                className={cn(
                  "flex size-7 items-center justify-center rounded-full text-xs font-semibold border-2 transition-colors",
                  done
                    ? "border-primary bg-primary text-primary-foreground"
                    : active
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-background text-muted-foreground"
                )}
              >
                {done ? "✓" : s.n}
              </div>
              <span
                className={cn(
                  "text-[11px] font-medium whitespace-nowrap",
                  active ? "text-primary" : done ? "text-foreground" : "text-muted-foreground"
                )}
              >
                {s.label}
              </span>
            </div>
            {i < FLOW_STEPS.length - 1 && (
              <div
                className={cn(
                  "mx-2 mb-4 h-0.5 w-10 shrink-0 rounded transition-colors",
                  step > s.n ? "bg-primary" : "bg-border"
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function NewCampaignPage() {
  const router = useRouter();

  const titles = useTagInput();
  const locations = useTagInput();
  const keywords = useTagInput();
  const [emailStatusSlugs, setEmailStatusSlugs] = useState<string[]>([]);
  const [industry, setIndustry] = useState("Any industry");
  const [employeeRange, setEmployeeRange] = useState("");

  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [campaignName, setCampaignName] = useState("");
  const [isFetching, setIsFetching] = useState(false);
  const [isEnriching, setIsEnriching] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [enrichPending, setEnrichPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [generatedCount, setGeneratedCount] = useState<number | null>(null);
  const [lastCampaignId, setLastCampaignId] = useState<string | null>(null);
  const [listPage, setListPage] = useState(1);
  const [hasMorePages, setHasMorePages] = useState(false);
  const [totalMatches, setTotalMatches] = useState<number | null>(null);

  const totalLeads = leads.length;
  const totalSelected = selectedLeadIds.length;

  const leadRowIds = useMemo(
    () => leads.map((lead) => lead._id).filter((id): id is string => Boolean(id)),
    [leads]
  );

  const allRowsSelected =
    leadRowIds.length > 0 && leadRowIds.every((id) => selectedLeadIds.includes(id));

  const currentStep: 1 | 2 | 3 =
    leads.length === 0
      ? 1
      : leads.some((l) => l.email != null && String(l.email).trim())
        ? 3
        : 2;

  const toggleRowExpanded = (key: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const runApolloSearch = async (pageNum: number) => {
    setError(null);
    setStatusMessage(null);
    setIsFetching(true);

    try {
      const qKeywordParts = [
        ...keywords.tags,
        ...(industry !== "Any industry" && industry.trim() ? [industry] : []),
      ];

      const res = await fetch("/api/apollo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filters: {
            person_titles: titles.tags,
            organization_num_employees_ranges: employeeRange ? [employeeRange] : [],
            person_locations: locations.tags,
            q_keywords: qKeywordParts.join(" ").trim(),
            contact_email_status: emailStatusSlugs,
          },
          page: pageNum,
          per_page: 10,
          ...(campaignName.trim() ? { campaign_name: campaignName.trim() } : {}),
        }),
      });

      const payload = (await res.json()) as ApolloResponse & { error?: string };

      if (!res.ok) throw new Error(payload.error ?? "Failed to fetch leads");

      setListPage(payload.current_page ?? pageNum);
      setHasMorePages(Boolean(payload.has_more));
      setTotalMatches(typeof payload.total_count === "number" ? payload.total_count : null);
      setLeads(payload.leads ?? []);
      setSelectedLeadIds([]);
      setExpandedRows(new Set());

      const campaign_id = payload.campaign_id != null ? String(payload.campaign_id) : null;
      setLastCampaignId(campaign_id);

      if (campaign_id) {
        router.push(`/campaigns/${campaign_id}?tab=leads`);
      }

      const total = payload.total_count ?? payload.leads?.length ?? 0;
      const pageN = payload.current_page ?? pageNum;
      const more = Boolean(payload.has_more);
      setStatusMessage(
        `Page ${pageN}: ${(payload.leads ?? []).length} leads loaded. Apollo reports ${total.toLocaleString()} total matches${more ? "; more pages available" : ""}. Select leads then Enrich to reveal emails.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch leads");
    } finally {
      setIsFetching(false);
    }
  };

  const enrichSelected = async () => {
    setError(null);
    setStatusMessage(null);
    const ids = selectedLeadIds.filter(Boolean);
    if (ids.length === 0) {
      setError("Select at least one lead to enrich.");
      return;
    }
    setIsEnriching(true);
    try {
      const res = await fetch("/api/apollo/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_ids: ids }),
      });
      const payload = (await res.json()) as {
        leads?: Array<{
          _id: string;
          email: string;
          phone: string;
          name?: string;
          company?: string;
          linkedin_url?: string;
          error?: string;
        }>;
        error?: string;
      };
      if (!res.ok) throw new Error(payload.error ?? "Enrichment failed");
      const byId = new Map((payload.leads ?? []).map((l) => [l._id, l]));
      const errs = (payload.leads ?? []).filter((l) => l.error).length;
      setLeads((prev) =>
        prev.map((lead) => {
          if (!lead._id) return lead;
          const u = byId.get(lead._id);
          if (!u) return lead;
          return {
            ...lead,
            name: u.name?.trim() ? u.name : lead.name,
            company: u.company?.trim() ? u.company : lead.company,
            email: u.email?.trim() ? u.email : lead.email,
            phone: u.phone ?? lead.phone,
            linkedin_url: u.linkedin_url?.trim() ? u.linkedin_url : lead.linkedin_url,
          };
        })
      );
      setStatusMessage(
        errs > 0
          ? `Enrichment done: ${ids.length - errs} updated, ${errs} failed.`
          : `Enriched ${ids.length} lead(s). Email, phone, and LinkedIn updated.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Enrichment failed");
    } finally {
      setIsEnriching(false);
    }
  };

  const removeLead = (lead: LeadRow) => {
    const key = lead._id ?? lead.apollo_person_id ?? "row";
    setLeads((prev) =>
      prev.filter((item) => (item._id ?? item.apollo_person_id ?? "row") !== key)
    );
    if (lead._id) setSelectedLeadIds((prev) => prev.filter((id) => id !== lead._id));
  };

  const generateMessage = async () => {
    setError(null);
    setStatusMessage(null);
    const validIds = selectedLeadIds.filter((id) => {
      const lead = leads.find((l) => l._id === id);
      return Boolean(lead && (lead.email ?? "").trim());
    });
    if (validIds.length === 0) {
      setError("Select leads with an email first (enrich to reveal).");
      return;
    }
    const skipped = selectedLeadIds.length - validIds.length;
    setIsGenerating(true);
    setGeneratedCount(null);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_ids: validIds }),
      });
      const payload = (await res.json()) as { processed_count?: number; error?: string };
      if (!res.ok) throw new Error(payload.error ?? "Failed to generate messages");
      const count = payload.processed_count ?? validIds.length;
      setGeneratedCount(count);
      if (skipped > 0) setStatusMessage(`${skipped} lead(s) skipped — no email. Enrich first.`);
      else setStatusMessage(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate messages");
    } finally {
      setIsGenerating(false);
    }
  };

  const toggleLeadSelection = (leadId: string, checked: boolean) =>
    setSelectedLeadIds((prev) =>
      checked ? Array.from(new Set([...prev, leadId])) : prev.filter((id) => id !== leadId)
    );

  const toggleSelectAll = (checked: boolean) =>
    setSelectedLeadIds(checked ? leadRowIds : []);

  useEffect(() => {
    if (!lastCampaignId) return;
    try {
      localStorage.setItem("dp_last_campaign_id", lastCampaignId);
    } catch {
      /* ignore */
    }
  }, [lastCampaignId]);

  const bulkActions = enrichPending
    ? [
        {
          label: `Confirm enrich (uses ${totalSelected} credits)`,
          onClick: () => {
            setEnrichPending(false);
            void enrichSelected();
          },
        },
        {
          label: "Cancel",
          onClick: () => setEnrichPending(false),
          variant: "outline" as const,
        },
      ]
    : [
        {
          label: `Enrich (${totalSelected} credits)`,
          onClick: () => setEnrichPending(true),
          variant: "outline" as const,
          disabled: isEnriching,
        },
        {
          label: isGenerating ? "Generating…" : "Generate messages",
          onClick: () => void generateMessage(),
          disabled: isGenerating,
        },
      ];

  return (
    <AppShell>
      <main className="flex w-full flex-col gap-6">

        <PageHeader title="New Campaign" subtitle="Search Apollo to find and add leads" />

        {/* ── Flow stepper ─────────────────────────────────────────────── */}
        <div className="w-full mb-6">
          <FlowStepper step={currentStep} />
        </div>

        {/* ── Main content: sidebar + results ──────────────────────────── */}
        <div className="flex w-full flex-col gap-6 lg:flex-row">

          {/* ── Filters sidebar ─────────────────────────────────────────── */}
          <aside className="w-full lg:w-72 shrink-0">
            <div className="rounded-xl border border-border bg-card">
              <div className="border-b border-border px-5 py-4 space-y-3">
                <div>
                  <h1 className="font-semibold">Filters</h1>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Apollo People Search —{" "}
                    <a
                      className="text-primary underline-offset-4 hover:underline"
                      href="https://docs.apollo.io/docs/find-people-using-filters"
                      target="_blank"
                      rel="noreferrer"
                    >
                      docs
                    </a>
                  </p>
                </div>
                <div>
                  <label htmlFor="campaign-name" className="mb-1 block text-xs font-medium text-muted-foreground">
                    Campaign name
                  </label>
                  <input
                    id="campaign-name"
                    value={campaignName}
                    onChange={(e) => setCampaignName(e.target.value)}
                    placeholder="e.g. VP Sales — US SaaS Q2"
                    className="h-8 w-full rounded-md border border-input bg-background px-3 text-xs outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
              </div>

              <div className="px-5">
                {/* Job titles */}
                <FilterSection label="Job titles" badge={titles.tags.length}>
                  <TagInput
                    value={titles.input}
                    onChange={titles.setInput}
                    onAdd={titles.add}
                    placeholder="e.g. VP of Sales"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">Press Enter or comma to add</p>
                  <TagList tags={titles.tags} onRemove={titles.remove} />
                </FilterSection>

                {/* Industry */}
                <FilterSection label="Industry" badge={industry !== "Any industry" ? 1 : 0} defaultOpen={false}>
                  <select
                    value={industry}
                    onChange={(e) => setIndustry(e.target.value)}
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {INDUSTRY_KEYWORD_PRESETS.map((v) => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                </FilterSection>

                {/* Company size */}
                <FilterSection label="Company size" badge={employeeRange ? 1 : 0} defaultOpen={false}>
                  <select
                    value={employeeRange}
                    onChange={(e) => setEmployeeRange(e.target.value)}
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {APOLLO_EMPLOYEE_RANGE_PRESETS.map((opt) => (
                      <option key={opt.value || "any"} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </FilterSection>

                {/* Location */}
                <FilterSection label="Location" badge={locations.tags.length} defaultOpen={false}>
                  <LocationSuggestInput
                    input={locations.input}
                    onChangeInput={locations.setInput}
                    onAddManual={locations.add}
                    onPickSuggestion={locations.addRaw}
                  />
                
                  <TagList tags={locations.tags} onRemove={locations.remove} />
                </FilterSection>

                {/* Keywords */}
                <FilterSection label="Keywords" badge={keywords.tags.length} defaultOpen={false}>
                  <TagInput
                    value={keywords.input}
                    onChange={keywords.setInput}
                    onAdd={keywords.add}
                    placeholder="Add keyword"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">Press Enter or comma to add</p>
                  <TagList tags={keywords.tags} onRemove={keywords.remove} />
                </FilterSection>

                {/* Email status */}
                <FilterSection label="Email status" badge={emailStatusSlugs.length} defaultOpen={false}>
                  <CheckboxGroup
                    options={APOLLO_CONTACT_EMAIL_STATUSES}
                    selected={emailStatusSlugs}
                    onChange={setEmailStatusSlugs}
                  />
                </FilterSection>
              </div>

              <div className="space-y-2 border-t border-border px-5 py-4">
                <Button
                  type="button"
                  onClick={() => runApolloSearch(1)}
                  disabled={isFetching}
                  className="w-full rounded-full"
                >
                  {isFetching ? "Fetching…" : "Fetch Leads"}
                </Button>
              </div>
            </div>
          </aside>

          {/* ── Results ─────────────────────────────────────────────────── */}
          <section className="flex-1 rounded-xl border border-border bg-card p-5">

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Lead Results</h2>
                <p className="text-sm text-muted-foreground">
                  Rows on this page:{" "}
                  <span className="font-medium text-foreground">{totalLeads}</span>
                  {totalMatches != null && (
                    <>
                      {" "}· Apollo total:{" "}
                      <span className="font-medium text-foreground">
                        {totalMatches.toLocaleString()}
                      </span>
                    </>
                  )}
                  {(listPage > 1 || hasMorePages) && (
                    <>
                      {" "}· Page{" "}
                      <span className="font-medium text-foreground">{listPage}</span>
                    </>
                  )}
                </p>
              </div>
            </div>

            <div className="mt-3 flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => runApolloSearch(listPage - 1)}
                disabled={isFetching || listPage <= 1}
                className="px-3"
              >
                Previous page
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => runApolloSearch(listPage + 1)}
                disabled={isFetching || !hasMorePages}
                className="px-3"
              >
                Next page
              </Button>
            </div>

            {error && (
              <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}

            {statusMessage && !error && (
              <div className="mt-4 rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground">
                {statusMessage}
              </div>
            )}

            {/* Post-generate CTA */}
            {generatedCount !== null && lastCampaignId && (
              <div className="mt-4 rounded-lg border border-primary/25 bg-primary/5 px-4 py-3">
                <p className="text-sm font-medium text-foreground">
                  ✓ Messages generated for {generatedCount} lead{generatedCount !== 1 ? "s" : ""}.
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Choose a next step:
                </p>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  <Link
                    href={`/campaigns/${lastCampaignId}?tab=template`}
                    className={cn(buttonVariants({ size: "sm" }), "px-3")}
                  >
                    Review email template →
                  </Link>
                  <Link
                    href={`/campaigns/${lastCampaignId}?tab=pipeline`}
                    className={cn(buttonVariants({ variant: "outline", size: "sm" }), "px-3")}
                  >
                    Open Pipeline
                  </Link>
                </div>
              </div>
            )}

            {/* Zero-results hint */}
            {!isFetching && !error && totalMatches === 0 && (
              <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
                <span className="font-semibold">No matches found.</span> Try these fixes:
                <ul className="mt-1.5 list-disc pl-4 space-y-0.5 text-xs">
                  <li>
                    Remove the <strong>Email Status</strong> filter — the Verified option is very
                    restrictive in narrow segments
                  </li>
                  <li>Broaden <strong>Company Size</strong> or remove it entirely</li>
                  <li>Add more <strong>Job Title</strong> variants (e.g. VP Sales and Head of Sales)</li>
                  <li>Try a wider <strong>Location</strong> (e.g. United States instead of a city)</li>
                </ul>
              </div>
            )}

            <div className="mt-4 overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[700px] border-collapse text-sm">
                <thead className="bg-muted/40">
                  <tr className="text-left">
                    <th className="w-10 px-3 py-2">
                      <input
                        type="checkbox"
                        checked={allRowsSelected}
                        onChange={(e) => toggleSelectAll(e.target.checked)}
                        aria-label="Select all"
                      />
                    </th>
                    <th className="px-3 py-2 font-medium">Name + Role</th>
                    <th className="px-3 py-2 font-medium">Company</th>
                    <th className="px-3 py-2 font-medium">Email</th>
                    <th className="px-3 py-2 font-medium">LinkedIn</th>
                    <th className="w-28 px-3 py-2 text-right font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-10 text-center text-muted-foreground">
                        No results yet. Set your filters and click Fetch Leads.
                      </td>
                    </tr>
                  ) : (
                    leads.map((lead) => {
                      const key = lead._id ?? lead.apollo_person_id ?? lead.name;
                      const isSelected = lead._id ? selectedLeadIds.includes(lead._id) : false;
                      const isExpanded = expandedRows.has(key);
                      const emailDisplay =
                        lead.email != null && String(lead.email).trim()
                          ? String(lead.email)
                          : "—";
                      const phoneDisplay =
                        lead.phone != null && String(lead.phone).trim()
                          ? String(lead.phone)
                          : "—";

                      return (
                        <>
                          <tr key={key} className="border-t border-border hover:bg-muted/20">
                            <td className="px-3 py-2">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                disabled={!lead._id}
                                onChange={(e) =>
                                  lead._id && toggleLeadSelection(lead._id, e.target.checked)
                                }
                                aria-label={`Select ${lead.name}`}
                              />
                            </td>
                            <td className="px-3 py-2">
                              <span className="font-medium">{lead.name}</span>
                              {lead.role && (
                                <span className="block text-xs text-muted-foreground">{lead.role}</span>
                              )}
                            </td>
                            <td className="px-3 py-2">{lead.company || "—"}</td>
                            <td className="px-3 py-2">{emailDisplay}</td>
                            <td className="px-3 py-2">
                              {lead.linkedin_url ? (
                                <a
                                  href={lead.linkedin_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-primary underline-offset-4 hover:underline"
                                >
                                  View
                                </a>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td className="px-3 py-2 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => toggleRowExpanded(key)}
                                  aria-label={isExpanded ? "Collapse row" : "Expand row"}
                                  className="px-2"
                                >
                                  <ChevronDown
                                    className={cn(
                                      "size-4 transition-transform",
                                      isExpanded && "rotate-180"
                                    )}
                                  />
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => removeLead(lead)}
                                  className="px-3"
                                >
                                  Remove
                                </Button>
                              </div>
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr key={`${key}-expanded`} className="bg-muted/30">
                              <td
                                colSpan={6}
                                className="px-3 py-2 text-xs text-muted-foreground"
                              >
                                phone: {phoneDisplay} · location: {lead.location || "—"}
                              </td>
                            </tr>
                          )}
                        </>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </main>

      <BulkActionBar
        count={totalSelected}
        onClear={() => setSelectedLeadIds([])}
        actions={bulkActions}
      />
    </AppShell>
  );
}
