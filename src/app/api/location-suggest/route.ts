import { NextRequest, NextResponse } from "next/server";

const PLACES_AUTOCOMPLETE_URL =
  "https://places.googleapis.com/v1/places:autocomplete";

type LocationSuggestion = {
  apollo_value: string;
  label: string;
};

type LocalizedText = { text?: string };

type PlacePrediction = {
  placeId?: string;
  text?: LocalizedText;
  structuredFormat?: {
    mainText?: LocalizedText;
    secondaryText?: LocalizedText;
  };
};

type AutocompleteSuggestion = {
  placePrediction?: PlacePrediction;
  queryPrediction?: { text?: LocalizedText };
};

type AutocompleteResponse = {
  suggestions?: AutocompleteSuggestion[];
  error?: { message?: string; status?: string };
};

/**
 * English-only line suitable for Apollo `person_locations[]`.
 * Prefer structured main + secondary from Places; fall back to full text.
 */
function toApolloLocation(p: PlacePrediction): string {
  const full = (p.text?.text ?? "").trim();
  const main = (p.structuredFormat?.mainText?.text ?? "").trim();
  const sec = (p.structuredFormat?.secondaryText?.text ?? "").trim();

  if (main && sec) {
    const secLower = sec.toLowerCase();
    const mainLower = main.toLowerCase();
    if (secLower === mainLower) return sec;
    if (secLower.startsWith(`${mainLower},`)) return sec;
    return `${main}, ${sec}`;
  }

  if (full) {
    const parts = full.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length > 4) return parts.slice(-4).join(", ");
    return full;
  }

  return main || sec || "";
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return NextResponse.json({ suggestions: [] as LocationSuggestion[] });
  }

  const apiKey =
    process.env.GOOGLE_PLACES_API_KEY?.trim() ||
    process.env.GOOGLE_MAPS_API_KEY?.trim();

  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "Set GOOGLE_PLACES_API_KEY (or GOOGLE_MAPS_API_KEY) with Places API (New) enabled.",
        suggestions: [] as LocationSuggestion[],
      },
      { status: 503 }
    );
  }

  const fieldMask = [
    "suggestions.placePrediction.placeId",
    "suggestions.placePrediction.text.text",
    "suggestions.placePrediction.structuredFormat.mainText.text",
    "suggestions.placePrediction.structuredFormat.secondaryText.text",
    "suggestions.placePrediction.types",
    "suggestions.queryPrediction.text.text",
  ].join(",");

  const body: Record<string, string> = {
    input: q,
    languageCode: "en",
  };
  const regionBias = process.env.GOOGLE_PLACES_REGION?.trim();
  if (regionBias) {
    body.regionCode = regionBias;
  }

  let res: Response;
  try {
    res = await fetch(PLACES_AUTOCOMPLETE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": fieldMask,
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    return NextResponse.json(
      { error: "Places request failed", suggestions: [] },
      { status: 502 }
    );
  }

  const raw = await res.text();
  let data: AutocompleteResponse;
  try {
    data = raw ? (JSON.parse(raw) as AutocompleteResponse) : {};
  } catch {
    return NextResponse.json(
      { error: "Invalid Places response", suggestions: [] },
      { status: 502 }
    );
  }

  if (!res.ok) {
    const msg =
      data.error?.message ||
      (typeof raw === "string" && raw.slice(0, 200)) ||
      `HTTP ${res.status}`;
    return NextResponse.json(
      { error: msg, suggestions: [] as LocationSuggestion[] },
      { status: res.status >= 400 && res.status < 600 ? res.status : 502 }
    );
  }

  const out: LocationSuggestion[] = [];
  const seen = new Set<string>();

  for (const row of data.suggestions ?? []) {
    const pp = row.placePrediction;
    if (pp) {
      const apollo_value = toApolloLocation(pp);
      if (!apollo_value || seen.has(apollo_value)) continue;
      seen.add(apollo_value);
      out.push({
        apollo_value,
        label: (pp.text?.text ?? apollo_value).trim(),
      });
      continue;
    }

    const qt = row.queryPrediction?.text?.text?.trim();
    if (qt && !seen.has(qt)) {
      seen.add(qt);
      out.push({ apollo_value: qt, label: qt });
    }
  }

  return NextResponse.json({ suggestions: out.slice(0, 8) });
}
