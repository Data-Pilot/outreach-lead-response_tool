import mongoose from "mongoose";
import { NextResponse } from "next/server";

import { Campaign } from "../../../../models/Campaign";
import { Lead } from "../../../../models/Lead";

/** POST body for Apollo People API Search (`mixed_people/api_search` — no credits). */
export type ApolloSearchBody = {
  filters?: {
    person_titles?: string[];
    organization_num_employees_ranges?: string[];
    person_locations?: string[];
    q_keywords?: string;
    person_seniorities?: string[];
    contact_email_status?: string[];
  };
  page?: number;
  per_page?: number;
  /** Optional user-supplied campaign name. Falls back to auto-generated name. */
  campaign_name?: string;
};

type ApolloPerson = {
  id?: string;
  name?: string;
  first_name?: string;
  last_name?: string;
  last_name_obfuscated?: string;
  title?: string;
  headline?: string;
  organization?: {
    name?: string;
    primary_domain?: string;
    estimated_num_employees?: number;
    industry?: string;
  };
  city?: string;
  state?: string;
  country?: string;
  linkedin_url?: string;
};

type ApolloSearchResponse = {
  total_entries?: number;
  people?: ApolloPerson[];
  pagination?: {
    page?: number;
    per_page?: number;
    total_entries?: number;
    total_pages?: number;
  };
};

type ApolloBulkMatchResponse = {
  matches?: ApolloPerson[];
};

declare global {
  // eslint-disable-next-line no-var
  var __mongooseConnPromise: Promise<typeof mongoose> | undefined;
}

const APOLLO_BASE_URL = "https://api.apollo.io/api/v1";

function envFlagTrue(value: string | undefined): boolean {
  const v = (value ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

async function connectToMongo() {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error("MONGODB_URI is missing");
  }

  if (!global.__mongooseConnPromise) {
    global.__mongooseConnPromise = mongoose.connect(mongoUri, {
      bufferCommands: false,
    });
  }

  await global.__mongooseConnPromise;
  return mongoose.connection;
}

function uniqueTrim(values: string[] | undefined): string[] {
  if (!values?.length) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const t = String(v).trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

function normalizeLocation(person: ApolloPerson): string {
  const chunks = [person.city, person.state, person.country].filter(Boolean);
  return chunks.join(", ");
}

function normalizeName(person: ApolloPerson): string {
  if (person.name) return person.name;
  const last = person.last_name || person.last_name_obfuscated || "";
  return [person.first_name, last].filter(Boolean).join(" ").trim();
}

function buildApolloRequestBody(
  filters: NonNullable<ApolloSearchBody["filters"]>,
  page: number,
  perPage: number
): Record<string, unknown> {
  const body: Record<string, unknown> = { page, per_page: perPage };

  const titles = uniqueTrim(filters.person_titles);
  if (titles.length > 0) {
    body.person_titles = titles;
    body.include_similar_titles = true;
  }

  const ranges = uniqueTrim(filters.organization_num_employees_ranges);
  if (ranges.length > 0) body.organization_num_employees_ranges = ranges;

  const locations = uniqueTrim(filters.person_locations);
  if (locations.length > 0) body.person_locations = locations;

  const seniorities = uniqueTrim(filters.person_seniorities);
  if (seniorities.length > 0) body.person_seniorities = seniorities;

  const emailStatuses = uniqueTrim(filters.contact_email_status);
  if (emailStatuses.length > 0) body.contact_email_status = emailStatuses;

  const kw = (filters.q_keywords ?? "").trim();
  if (kw) body.q_keywords = kw;

  return body;
}

/** Deterministic fake people when `MOCK_APOLLO` is on — no outbound Apollo calls. */
function buildMockSearchPeople(
  filters: NonNullable<ApolloSearchBody["filters"]>,
  page: number,
  perPage: number
): { people: ApolloPerson[]; totalCount: number; currentPage: number } {
  const titles = uniqueTrim(filters.person_titles);
  const locs = uniqueTrim(filters.person_locations);
  const titleBase = titles[0] ?? "Software Engineer";
  const locLabel = locs[0] ?? "Austin, Texas, US";
  const kw = (filters.q_keywords ?? "").trim();
  const industry = kw || "Computer Software";
  const totalCount = 47;
  const currentPage = page;
  const start = (page - 1) * perPage;
  const remaining = Math.max(0, totalCount - start);
  const count = Math.min(perPage, remaining);
  const city = locLabel.split(",")[0]?.trim() || "Austin";

  const people: ApolloPerson[] = [];
  for (let i = 0; i < count; i++) {
    const n = start + i + 1;
    people.push({
      id: `mock-apollo-person-${n}`,
      name: `Mock Prospect ${n}`,
      title: titleBase,
      headline: `${titleBase} (mock)`,
      organization: {
        name: `MockCo ${((n - 1) % 5) + 1}`,
        primary_domain: `mockco${((n - 1) % 5) + 1}.example.invalid`,
        estimated_num_employees: 25,
        industry,
      },
      city,
      state: "TX",
      country: "US",
      linkedin_url: "",
    });
  }

  return { people, totalCount, currentPage };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as ApolloSearchBody;
    const filters = body.filters ?? {};

    const page = Math.max(1, Number(body.page ?? 1));
    const perPage = Math.min(100, Math.max(1, Number(body.per_page ?? 10)));

    const mockApollo = envFlagTrue(process.env.MOCK_APOLLO);
    const apolloApiKey = process.env.APOLLO_API_KEY;
    if (!mockApollo && !apolloApiKey) {
      return NextResponse.json(
        { error: "APOLLO_API_KEY is missing" },
        { status: 500 }
      );
    }

    await connectToMongo();

    let people: ApolloPerson[];
    let totalCount: number;
    let currentPage: number;

    if (mockApollo) {
      const built = buildMockSearchPeople(filters, page, perPage);
      people = built.people;
      totalCount = built.totalCount;
      currentPage = built.currentPage;
    } else {
      const apolloRequestBody = buildApolloRequestBody(filters, page, perPage);

      const apolloResponse = await fetch(
        `${APOLLO_BASE_URL}/mixed_people/api_search`,
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            "Cache-Control": "no-cache",
            "X-Api-Key": apolloApiKey as string,
          },
          body: JSON.stringify(apolloRequestBody),
          cache: "no-store",
        }
      );

      if (!apolloResponse.ok) {
        const errorText = await apolloResponse.text();
        return NextResponse.json(
          {
            error: "Apollo search request failed",
            status: apolloResponse.status,
            details: errorText,
          },
          { status: 502 }
        );
      }

      const apolloPayload = (await apolloResponse.json()) as ApolloSearchResponse;
      let fetchedPeople = Array.isArray(apolloPayload.people)
        ? apolloPayload.people
        : [];

      // Enrich previews with real emails/names/locations via bulk_match (costs credits).
      // Builds a lookup map keyed by apollo person id so we can merge results below.
      const enrichedById = new Map<string, ApolloPerson>();
      const apolloIds = fetchedPeople.map((p) => p.id).filter(Boolean) as string[];

      // bulk_match consumes credits; search alone (mixed_people/api_search) is the cheap path.
      // Opt in with APOLLO_BULK_MATCH_ON_SEARCH=true if you want merged preview rows on fetch.
      const bulkMatchOnSearch = envFlagTrue(
        process.env.APOLLO_BULK_MATCH_ON_SEARCH
      );

      if (bulkMatchOnSearch && apolloIds.length > 0) {
        const bulkRes = await fetch(`${APOLLO_BASE_URL}/people/bulk_match`, {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            "X-Api-Key": apolloApiKey as string,
          },
          body: JSON.stringify({
            details: apolloIds.map((id) => ({ id })),
            reveal_personal_emails: false,
          }),
          cache: "no-store",
        });

        if (bulkRes.ok) {
          const bulkPayload = (await bulkRes.json()) as ApolloBulkMatchResponse;
          for (const match of bulkPayload.matches ?? []) {
            if (match.id) enrichedById.set(match.id, match);
          }
          // Replace preview records with enriched ones where available
          fetchedPeople = fetchedPeople.map((p) =>
            p.id && enrichedById.has(p.id)
              ? { ...p, ...enrichedById.get(p.id)! }
              : p
          );
        }
        // If bulk_match fails (e.g. no credits), we silently continue with preview data.
      }

      people = fetchedPeople;
      totalCount =
        apolloPayload.total_entries ??
        apolloPayload.pagination?.total_entries ??
        people.length;

      currentPage = apolloPayload.pagination?.page ?? page;
    }

    const hasMore = currentPage * perPage < totalCount;

    const campaign = await Campaign.create({
      name: mockApollo
        ? `Mock Apollo Search ${new Date().toISOString()}`
        : `Apollo Search ${new Date().toISOString()}`,
      filters: {
        person_titles: uniqueTrim(filters.person_titles),
        organization_num_employees_ranges: uniqueTrim(
          filters.organization_num_employees_ranges
        ),
        person_locations: uniqueTrim(filters.person_locations),
        q_keywords: (filters.q_keywords ?? "").trim(),
        person_seniorities: uniqueTrim(filters.person_seniorities),
        contact_email_status: uniqueTrim(filters.contact_email_status),
      },
      total_leads: 0,
      status: "draft",
    });

    const leadsOut: Array<{
      _id: string;
      apollo_person_id: string;
      name: string;
      role: string;
      company: string;
      email: string | null;
      phone: string;
      location: string;
      linkedin_url: string;
    }> = [];

    for (const person of people) {
      const apolloId = person.id?.trim();
      if (!apolloId) continue;

      const name = normalizeName(person);
      const role = person.title ?? person.headline ?? "";
      const company = person.organization?.name ?? "";
      const location =
        normalizeLocation(person) ||
        uniqueTrim(filters.person_locations).join(", ") ||
        "";
      const companySize = person.organization?.estimated_num_employees
        ? String(person.organization.estimated_num_employees)
        : uniqueTrim(filters.organization_num_employees_ranges).join("; ");
      const industry = person.organization?.industry ?? "";

      const doc = await Lead.findOneAndUpdate(
        { campaign_id: campaign._id, apollo_person_id: apolloId },
        {
          $set: {
            apollo_person_id: apolloId,
            campaign_id: campaign._id,
            name,
            role,
            company,
            linkedin_url: person.linkedin_url ?? "",
            company_size: companySize,
            industry,
            location,
            status: "fetched",
          },
          $setOnInsert: {
            email: "",
            phone: "",
            variations: { a: "", b: "", c: "" },
            approved_variation: "",
            created_at: new Date(),
          },
        },
        {
          upsert: true,
          returnDocument: "after",
          setDefaultsOnInsert: true,
        }
      );

      if (doc) {
        leadsOut.push({
          _id: String(doc._id),
          apollo_person_id: apolloId,
          name: name || "—",
          role: role || "—",
          company: company || "—",
          email: (doc.email ?? "").trim() || null,
          phone: doc.phone ?? "",
          location: location || "—",
          linkedin_url: person.linkedin_url ?? "",
        });
      }
    }

    const savedCount = await Lead.countDocuments({ campaign_id: campaign._id });
    await Campaign.findByIdAndUpdate(campaign._id, { total_leads: savedCount });

    return NextResponse.json({
      campaign_id: String(campaign._id),
      leads: leadsOut,
      total_count: totalCount,
      current_page: currentPage,
      has_more: hasMore,
      ...(mockApollo && {
        mock: true as const,
        note: "MOCK_APOLLO is on: no Apollo search calls; leads are synthetic.",
      }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
