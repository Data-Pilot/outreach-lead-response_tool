import { NextResponse } from "next/server";

import { getMongoUserIdFromSession } from "@/lib/campaign-access";
import { STRATEGIC_ENHANCE_DEFAULTS } from "@/lib/strategic-enhance-limits";

type GeminiGenerateContentResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
};

type GeminiPart =
  | { text: string }
  | { inline_data: { mime_type: string; data: string } };

const GEMINI_MODEL =
  process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
const GEMINI_API_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models";

function envInt(name: string, fallback: number, min: number, max: number) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

const MAX_FILES = envInt(
  "STRATEGIC_ENHANCE_MAX_FILES",
  STRATEGIC_ENHANCE_DEFAULTS.maxFiles,
  1,
  20
);
const MAX_FILE_BYTES = envInt(
  "STRATEGIC_ENHANCE_MAX_FILE_BYTES",
  STRATEGIC_ENHANCE_DEFAULTS.maxFileBytes,
  1024,
  5 * 1024 * 1024
);
const MAX_TOTAL_BYTES = envInt(
  "STRATEGIC_ENHANCE_MAX_TOTAL_BYTES",
  STRATEGIC_ENHANCE_DEFAULTS.maxTotalBytes,
  1024,
  10 * 1024 * 1024
);

const PDF_ALLOWED =
  (process.env.STRATEGIC_ENHANCE_ALLOW_PDF ?? "true").toLowerCase() !== "false";

type RefInput = {
  name?: unknown;
  mimeType?: unknown;
  text?: unknown;
  dataBase64?: unknown;
};

type Body = {
  text?: unknown;
  references?: unknown;
};

function sanitizeFileName(name: string): string {
  const base = name.replace(/^.*[/\\]/, "").trim();
  return base.slice(0, 200) || "unnamed";
}

function isAllowedTextRef(mime: string, fileName: string): boolean {
  const m = mime.toLowerCase();
  if (m === "text/plain" || m === "text/markdown") return true;
  if (!m || m === "application/octet-stream") {
    const n = fileName.toLowerCase();
    return n.endsWith(".txt") || n.endsWith(".md");
  }
  return false;
}

function looksLikePdf(buffer: Buffer): boolean {
  return buffer.length >= 5 && buffer.subarray(0, 5).toString("ascii") === "%PDF-";
}

type NormalizedRef =
  | { kind: "text"; name: string; mimeType: string; text: string }
  | { kind: "pdf"; name: string; buffer: Buffer };

function normalizeReferences(raw: unknown): {
  ok: true;
  refs: NormalizedRef[];
} | { ok: false; error: string } {
  if (raw === undefined || raw === null) {
    return { ok: true, refs: [] };
  }
  if (!Array.isArray(raw)) {
    return { ok: false, error: "references must be an array when provided" };
  }
  if (raw.length > MAX_FILES) {
    return {
      ok: false,
      error: `At most ${MAX_FILES} reference files allowed`,
    };
  }

  const refs: NormalizedRef[] = [];
  let totalBytes = 0;

  for (let i = 0; i < raw.length; i++) {
    const item = raw[i] as RefInput;
    if (!item || typeof item !== "object") {
      return { ok: false, error: `references[${i}] must be an object` };
    }

    const name =
      typeof item.name === "string" ? sanitizeFileName(item.name) : "";
    if (!name) {
      return { ok: false, error: `references[${i}].name is required` };
    }

    const mimeType =
      typeof item.mimeType === "string" ? item.mimeType.trim() : "";

    if (mimeType === "application/pdf" || name.toLowerCase().endsWith(".pdf")) {
      if (!PDF_ALLOWED) {
        return { ok: false, error: "PDF reference files are disabled" };
      }
      if (typeof item.dataBase64 !== "string" || !item.dataBase64.trim()) {
        return {
          ok: false,
          error: `references[${i}].dataBase64 is required for PDF`,
        };
      }
      let buffer: Buffer;
      try {
        buffer = Buffer.from(item.dataBase64.trim(), "base64");
      } catch {
        return { ok: false, error: `references[${i}]: invalid base64` };
      }
      if (buffer.length === 0) {
        return { ok: false, error: `references[${i}]: empty PDF` };
      }
      if (buffer.length > MAX_FILE_BYTES) {
        return {
          ok: false,
          error: `references[${i}]: file exceeds ${MAX_FILE_BYTES} bytes`,
        };
      }
      if (!looksLikePdf(buffer)) {
        return { ok: false, error: `references[${i}]: not a valid PDF` };
      }
      totalBytes += buffer.length;
      if (totalBytes > MAX_TOTAL_BYTES) {
        return {
          ok: false,
          error: `Total reference size exceeds ${MAX_TOTAL_BYTES} bytes`,
        };
      }
      refs.push({ kind: "pdf", name, buffer });
      continue;
    }

    if (!isAllowedTextRef(mimeType, name)) {
      return {
        ok: false,
        error: `references[${i}]: only .txt, .md, or PDF files are allowed`,
      };
    }
    if (typeof item.text !== "string") {
      return {
        ok: false,
        error: `references[${i}].text is required for text/markdown`,
      };
    }
    const text = item.text;
    const byteLen = Buffer.byteLength(text, "utf8");
    if (byteLen === 0) {
      return { ok: false, error: `references[${i}]: empty text` };
    }
    if (byteLen > MAX_FILE_BYTES) {
      return {
        ok: false,
        error: `references[${i}]: text exceeds ${MAX_FILE_BYTES} bytes`,
      };
    }
    totalBytes += byteLen;
    if (totalBytes > MAX_TOTAL_BYTES) {
      return {
        ok: false,
        error: `Total reference size exceeds ${MAX_TOTAL_BYTES} bytes`,
      };
    }
    refs.push({
      kind: "text",
      name,
      mimeType: mimeType || "text/plain",
      text,
    });
  }

  return { ok: true, refs };
}

function buildInstructionPrompt(raw: string, refs: NormalizedRef[]): string {
  const refTextBlocks: string[] = [];
  for (const r of refs) {
    if (r.kind === "text") {
      refTextBlocks.push(
        `--- Reference file: ${r.name} (${r.mimeType}) ---\n${r.text}`
      );
    }
  }

  const refSection =
    refTextBlocks.length > 0
      ? [
          "",
          "Reference materials (factual only; do not invent beyond these and the Original below):",
          "",
          ...refTextBlocks,
          "",
        ].join("\n")
      : "";

  const pdfNote =
    refs.some((r) => r.kind === "pdf")
      ? "\nAdditional PDF reference(s) are attached after this message as inline files. Treat their content as factual reference only.\n"
      : "";

  const originalSection =
    raw.length > 0
      ? ["Original:", raw].join("\n")
      : [
          "The user has not written a draft Strategic Identity in the main field.",
          "Draft one or two tight paragraphs using the reference materials only where they apply; if references are thin, produce a minimal honest positioning paragraph and avoid invention.",
        ].join("\n");

  return [
    "You are an expert B2B positioning strategist. Your task is to refine a Strategic Identity used for AI-driven outreach. The subject may be a company or an individual professional.",
    "",
    "Rewrite into one or two tight paragraphs that are:",
    "- Clear and easy to understand",
    "- Confident but not exaggerated",
    "- Specific about who they serve, what they do, and the value they deliver",
    "- Focused on differentiation (what makes them meaningfully distinct)",
    "",
    "Preserve all factual accuracy. Do not invent capabilities, clients, roles, or results. If something is vague, clarify it without adding new claims.",
    "",
    "Adapt appropriately:",
    "- If it is a company, emphasize offering, market, and differentiation",
    "- If it is an individual, emphasize expertise, role, and outcomes delivered",
    "",
    "Improve:",
    "- Clarity (remove fluff, simplify phrasing)",
    "- Precision (replace generic terms with concrete ones where possible)",
    "- Positioning (highlight target customer, problem, and outcome)",
    "",
    "Avoid:",
    "- Buzzwords and hype (e.g., “cutting-edge”, “world-class”, “revolutionary” unless explicitly stated)",
    "- Overly corporate language when the subject is an individual",
    "- Bullet points, lists, or headings",
    "- Markdown formatting",
    "",
    "Output plain text only.",
    pdfNote,
    refSection,
    originalSection,
  ].join("\n");
}

function buildGeminiParts(instruction: string, refs: NormalizedRef[]): GeminiPart[] {
  const parts: GeminiPart[] = [{ text: instruction }];
  for (const r of refs) {
    if (r.kind === "pdf") {
      parts.push({
        inline_data: {
          mime_type: "application/pdf",
          data: r.buffer.toString("base64"),
        },
      });
    }
  }
  return parts;
}

function extractGeminiText(payload: GeminiGenerateContentResponse): string {
  const parts = payload.candidates?.[0]?.content?.parts;
  if (!parts?.length) return "";
  const chunks = parts
    .map((p) => p.text)
    .filter((t): t is string => typeof t === "string" && t.trim().length > 0);
  return chunks.join("\n\n").trim();
}

export async function POST(req: Request) {
  try {
    if (!(await getMongoUserIdFromSession())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as Body;
    const raw = typeof body.text === "string" ? body.text.trim() : "";

    const normalized = normalizeReferences(body.references);
    if (!normalized.ok) {
      return NextResponse.json({ error: normalized.error }, { status: 400 });
    }
    const refs = normalized.refs;

    if (!raw && refs.length === 0) {
      return NextResponse.json(
        {
          error:
            "Provide non-empty Strategic Identity text and/or at least one reference file",
        },
        { status: 400 }
      );
    }

    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY is missing" },
        { status: 500 }
      );
    }

    const instruction = buildInstructionPrompt(raw, refs);
    const parts = buildGeminiParts(instruction, refs);

    const response = await fetch(
      `${GEMINI_API_BASE}/${GEMINI_MODEL}:generateContent?key=${geminiApiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts }],
          generationConfig: { temperature: 0.7 },
        }),
        cache: "no-store",
      }
    );

    if (!response.ok) {
      const details = await response.text();
      return NextResponse.json(
        { error: `Gemini request failed (${response.status})`, details },
        { status: 502 }
      );
    }

    const payload = (await response.json()) as GeminiGenerateContentResponse;
    const text = extractGeminiText(payload);

    if (!text) {
      return NextResponse.json(
        { error: "Gemini returned empty text" },
        { status: 502 }
      );
    }

    return NextResponse.json({ text });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
