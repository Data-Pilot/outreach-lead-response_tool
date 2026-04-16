import type { LeadDocument } from "../../models/Lead";

const INSTANTLY_V1_BASE = "https://api.instantly.ai/api/v1";
const LEAD_BATCH_SIZE = 100;

export type LeadForInstantly = Pick<
  LeadDocument,
  "email" | "name" | "company" | "approved_variation"
>;

function getInstantlyApiKey(): string {
  const key = process.env.INSTANTLY_API_KEY;
  if (!key) {
    throw new Error("INSTANTLY_API_KEY is missing");
  }
  return key;
}

function mergeSchedule(
  base: Record<string, unknown>,
  override: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      out[key] &&
      typeof out[key] === "object" &&
      !Array.isArray(out[key])
    ) {
      out[key] = {
        ...(out[key] as Record<string, unknown>),
        ...(value as Record<string, unknown>),
      };
    } else {
      out[key] = value;
    }
  }
  return out;
}

/** Default: Mon–Fri, 09:00–17:00 in the server timezone (override via `schedule`). */
export function defaultWeekdaySchedule(): Record<string, unknown> {
  const timezone =
    typeof Intl !== "undefined"
      ? Intl.DateTimeFormat().resolvedOptions().timeZone
      : "UTC";

  return {
    campaign_schedule: {
      schedules: [
        {
          name: "Weekdays 9-5",
          timing: { from: "09:00", to: "17:00" },
          days: {
            "0": false,
            "1": true,
            "2": true,
            "3": true,
            "4": true,
            "5": true,
            "6": false,
          },
          timezone,
        },
      ],
    },
  };
}

function splitFullName(fullName: string): { first_name: string; last_name: string } {
  const trimmed = fullName.trim();
  if (!trimmed) {
    return { first_name: "", last_name: "" };
  }
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) {
    return { first_name: parts[0], last_name: "" };
  }
  return { first_name: parts[0]!, last_name: parts.slice(1).join(" ") };
}

export function mapLeadToInstantly(lead: LeadForInstantly) {
  const { first_name, last_name } = splitFullName(lead.name ?? "");
  return {
    email: lead.email,
    first_name,
    last_name,
    company_name: lead.company ?? "",
    personalization: lead.approved_variation ?? "",
  };
}

async function instantlyPost(path: string, body: Record<string, unknown>) {
  const res = await fetch(`${INSTANTLY_V1_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }

  if (!res.ok) {
    const message =
      typeof json === "object" && json !== null && "message" in json
        ? String((json as { message?: unknown }).message)
        : text || res.statusText;
    throw new Error(`Instantly ${path} failed (${res.status}): ${message}`);
  }

  return json;
}

async function instantlyGet(path: string, query: Record<string, string>) {
  const qs = new URLSearchParams(query).toString();
  const res = await fetch(`${INSTANTLY_V1_BASE}${path}?${qs}`, {
    method: "GET",
    cache: "no-store",
  });

  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }

  if (!res.ok) {
    const message =
      typeof json === "object" && json !== null && "message" in json
        ? String((json as { message?: unknown }).message)
        : text || res.statusText;
    throw new Error(`Instantly ${path} failed (${res.status}): ${message}`);
  }

  return json;
}

function extractCampaignId(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid Instantly create campaign response");
  }
  const p = payload as Record<string, unknown>;
  const candidates = [
    p.campaign_id,
    p.id,
    typeof p.data === "object" && p.data !== null
      ? (p.data as Record<string, unknown>).id
      : undefined,
    typeof p.data === "object" && p.data !== null
      ? (p.data as Record<string, unknown>).campaign_id
      : undefined,
  ];

  for (const c of candidates) {
    if (typeof c === "string" && c.length > 0) {
      return c;
    }
  }

  throw new Error("Could not read campaign_id from Instantly response");
}

export async function createCampaign(name: string, schedule: object) {
  const apiKey = getInstantlyApiKey();
  const schedulePayload = mergeSchedule(
    defaultWeekdaySchedule(),
    schedule as Record<string, unknown>
  );

  const payload = await instantlyPost("/campaign/create", {
    api_key: apiKey,
    name,
    ...schedulePayload,
  });

  return { campaign_id: extractCampaignId(payload), raw: payload };
}

export async function addLeads(campaign_id: string, leads: LeadForInstantly[]) {
  const apiKey = getInstantlyApiKey();
  let leads_added = 0;

  for (let i = 0; i < leads.length; i += LEAD_BATCH_SIZE) {
    const chunk = leads.slice(i, i + LEAD_BATCH_SIZE);
    const instantlyLeads = chunk.map(mapLeadToInstantly);

    const payload = (await instantlyPost("/lead/add", {
      api_key: apiKey,
      campaign_id,
      leads: instantlyLeads,
    })) as Record<string, unknown>;

    const uploaded = Number(payload.leads_uploaded ?? payload.total_sent ?? 0);
    if (!Number.isNaN(uploaded)) {
      leads_added += uploaded;
    } else {
      leads_added += instantlyLeads.length;
    }
  }

  return { leads_added };
}

export async function launchCampaign(campaign_id: string) {
  const apiKey = getInstantlyApiKey();
  const payload = (await instantlyPost("/campaign/launch", {
    api_key: apiKey,
    campaign_id,
  })) as Record<string, unknown>;

  const status =
    typeof payload.status === "string"
      ? payload.status
      : typeof payload.message === "string"
        ? payload.message
        : "launched";

  return { status, raw: payload };
}

export async function getCampaignStats(campaign_id: string) {
  const apiKey = getInstantlyApiKey();
  const payload = (await instantlyGet("/analytics/campaign/summary", {
    api_key: apiKey,
    campaign_id,
  })) as Record<string, unknown>;

  const sent = Number(
    payload.sent ?? payload.emails_sent ?? payload.total_sent ?? 0
  );
  const opened = Number(
    payload.opened ?? payload.emails_opened ?? payload.opens ?? 0
  );
  const replied = Number(
    payload.replied ?? payload.emails_replied ?? payload.replies ?? 0
  );

  return {
    sent: Number.isFinite(sent) ? sent : 0,
    opened: Number.isFinite(opened) ? opened : 0,
    replied: Number.isFinite(replied) ? replied : 0,
    raw: payload,
  };
}
