"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Briefcase,
  Coffee,
  File,
  FileText,
  Loader2,
  Paperclip,
  Wand2,
  X,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useSession } from "next-auth/react";

import { Button, buttonVariants } from "@/components/ui/button";
import { STRATEGIC_ENHANCE_DEFAULTS } from "@/lib/strategic-enhance-limits";
import { cn } from "@/lib/utils";

import type {
  OutreachConfigDTO,
  OutreachTone,
} from "../../models/OutreachConfig";

const PLACEHOLDER_CONTEXT =
  "We are a B2B SaaS company helping sales teams automate their outreach while maintaining a personal touch. Our AI-powered platform ensures every message feels authentic and tailored to the recipient.";

const DAILY_SLIDER_MAX = 20;

const toneOptions: Array<{
  id: OutreachTone;
  label: string;
  description: string;
  icon: typeof Briefcase;
}> = [
  {
    id: "professional",
    label: "Professional",
    description: "Formal and business-oriented",
    icon: Briefcase,
  },
  {
    id: "casual",
    label: "Casual",
    description: "Friendly and approachable",
    icon: Coffee,
  },
  {
    id: "direct",
    label: "Direct",
    description: "Concise and to the point",
    icon: Zap,
  },
];

async function fetchConfig(signal?: AbortSignal): Promise<OutreachConfigDTO> {
  const res = await fetch("/api/outreach-config", {
    cache: "no-store",
    signal,
  });
  const data = (await res.json()) as {
    config?: OutreachConfigDTO;
    error?: string;
  };
  if (!res.ok) throw new Error(data.error ?? "Failed to load settings");
  if (!data.config) throw new Error("Invalid response");
  return data.config;
}

async function putConfig(
  partial: Partial<{
    global_context: string;
    tone: OutreachTone;
    daily_linkedin_limit: number;
  }>
): Promise<OutreachConfigDTO> {
  const res = await fetch("/api/outreach-config", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(partial),
  });
  const data = (await res.json()) as {
    config?: OutreachConfigDTO;
    error?: string;
  };
  if (!res.ok) throw new Error(data.error ?? "Failed to save");
  if (!data.config) throw new Error("Invalid response");
  return data.config;
}

type LocalDpConfig = {
  context: string;
  tone: OutreachTone;
  daily_linkedin_limit: number;
  mongo_user_id?: string;
};

type RefFile = {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  text?: string;
  dataBase64?: string;
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

async function readFileAsRefPayload(file: File): Promise<Omit<RefFile, "id">> {
  const name = file.name;
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) {
    const buf = await file.arrayBuffer();
    if (buf.byteLength === 0) throw new Error(`${name} is empty`);
    return {
      name,
      size: buf.byteLength,
      mimeType: file.type?.trim() || "application/pdf",
      dataBase64: arrayBufferToBase64(buf),
    };
  }
  if (lower.endsWith(".txt") || lower.endsWith(".md")) {
    const text = await file.text();
    const size = new TextEncoder().encode(text).length;
    if (size === 0) throw new Error(`${name} is empty`);
    return {
      name,
      size,
      mimeType:
        file.type?.trim() ||
        (lower.endsWith(".md") ? "text/markdown" : "text/plain"),
      text,
    };
  }
  throw new Error("Only .txt, .md, and .pdf files are allowed");
}

function readLocalConfig(): LocalDpConfig | null {
  try {
    const raw = localStorage.getItem("dp_config");
    if (!raw?.trim()) return null;
    const s = JSON.parse(raw) as {
      context?: string;
      global_context?: string;
      tone?: string;
      daily_linkedin_limit?: number;
      mongo_user_id?: string;
    };
    const ctx = (s.global_context ?? s.context ?? "").trim();
    return {
      context: ctx,
      tone: (s.tone as OutreachTone) ?? "professional",
      daily_linkedin_limit: s.daily_linkedin_limit ?? 20,
      mongo_user_id:
        typeof s.mongo_user_id === "string" ? s.mongo_user_id : undefined,
    };
  } catch {
    return null;
  }
}

export function CommandCenterClient() {
  const { data: session, status: sessionStatus } = useSession();
  const mongoUserId = session?.user?.mongoUserId ?? null;
  const prevMongoUserIdRef = useRef<string | null>(null);

  const [globalContext, setGlobalContext] = useState(() => {
    if (typeof window === "undefined") return "";
    return readLocalConfig()?.context ?? "";
  });
  const [tone, setTone] = useState<OutreachTone>(() => {
    if (typeof window === "undefined") return "professional";
    return readLocalConfig()?.tone ?? "professional";
  });
  const [dailyLimit, setDailyLimit] = useState(() => {
    if (typeof window === "undefined") return 20;
    return readLocalConfig()?.daily_linkedin_limit ?? 20;
  });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applyConfig = useCallback(
    (
      c: OutreachConfigDTO,
      {
        syncStorage = false,
        showSaved = true,
        mongoUserId: mongoForStorage = null,
      }: {
        syncStorage?: boolean;
        showSaved?: boolean;
        mongoUserId?: string | null;
      } = {}
    ) => {
      setGlobalContext(c.global_context);
      setTone(c.tone);
      const cap = Math.min(DAILY_SLIDER_MAX, Math.max(1, c.daily_linkedin_limit));
      setDailyLimit(cap);

      if (syncStorage) {
        try {
          const payload: Record<string, unknown> = {
            context: c.global_context,
            tone: c.tone,
            daily_linkedin_limit: cap,
          };
          if (mongoForStorage) payload.mongo_user_id = mongoForStorage;
          localStorage.setItem("dp_config", JSON.stringify(payload));
          window.dispatchEvent(new Event("dp_config_updated"));
        } catch { /* ignore */ }
      }

      if (showSaved) {
        setSavedAt(Date.now());
        if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
        savedTimerRef.current = setTimeout(() => setSavedAt(null), 2000);
      } else {
        setSavedAt(null);
      }
    },
    []
  );

  // Single hydration path: register dp_config listener first, then load from API
  // only when localStorage is empty / wrong user / account switch (no race with app-shell).
  useEffect(() => {
    const onDpConfigUpdated = () => {
      const local = readLocalConfig();
      if (!local) return;
      setGlobalContext(local.context);
      setTone(local.tone);
      setDailyLimit(
        Math.min(DAILY_SLIDER_MAX, Math.max(1, local.daily_linkedin_limit))
      );
      setSavedAt(null);
    };

    window.addEventListener("dp_config_updated", onDpConfigUpdated);

    if (sessionStatus === "loading") {
      return () =>
        window.removeEventListener("dp_config_updated", onDpConfigUpdated);
    }

    if (sessionStatus !== "authenticated") {
      // `loading` was handled above; here we are `unauthenticated` (or equivalent).
      setIsLoading(false);
      return () =>
        window.removeEventListener("dp_config_updated", onDpConfigUpdated);
    }

    if (!mongoUserId) {
      return () =>
        window.removeEventListener("dp_config_updated", onDpConfigUpdated);
    }

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 25_000);
    let cancelled = false;

    const switched =
      prevMongoUserIdRef.current !== null &&
      prevMongoUserIdRef.current !== mongoUserId;
    prevMongoUserIdRef.current = mongoUserId;

    if (switched) {
      try {
        localStorage.removeItem("dp_config");
      } catch { /* ignore */ }
    }

    setLoadError(null);
    setIsLoading(true);

    void (async () => {
      try {
        const local = readLocalConfig();
        const c = await fetchConfig(ac.signal);
        if (cancelled) return;
        const serverCtx = (c.global_context ?? "").trim();
        let next = c;
        if (!serverCtx && local?.context.trim()) {
          next = { ...c, global_context: local.context };
        }
        applyConfig(next, {
          syncStorage: true,
          showSaved: false,
          mongoUserId,
        });
      } catch (e) {
        if (!cancelled) {
          const local = readLocalConfig();
          if (local) {
            applyConfig(
              {
                global_context: local.context,
                tone: local.tone,
                daily_linkedin_limit: local.daily_linkedin_limit,
                updated_at: null,
              },
              { syncStorage: false, showSaved: false }
            );
          }
          setLoadError(
            e instanceof Error ? e.message : "Failed to load your settings"
          );
          if (process.env.NODE_ENV === "development") {
            console.warn("[CommandCenter] Failed to load config:", e);
          }
        }
      } finally {
        clearTimeout(timer);
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      ac.abort();
      window.removeEventListener("dp_config_updated", onDpConfigUpdated);
      setIsLoading(false);
    };
  }, [sessionStatus, mongoUserId, applyConfig]);

  const saveContextDebounced = useCallback((text: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      void (async () => {
        try {
          setSaveError(null);
          const c = await putConfig({ global_context: text });
          applyConfig(c, { syncStorage: true, mongoUserId });
        } catch (e) {
          setSaveError(e instanceof Error ? e.message : "Save failed");
        }
      })();
    }, 500);
  }, [applyConfig, mongoUserId]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, []);

  const persistTone = async (next: OutreachTone) => {
    setTone(next);
    try {
      setSaveError(null);
      const c = await putConfig({ tone: next });
      applyConfig(c, { syncStorage: true, mongoUserId });
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Save failed");
    }
  };

  const persistDaily = async (next: number) => {
    const clamped = Math.min(DAILY_SLIDER_MAX, Math.max(1, next));
    setDailyLimit(clamped);
    try {
      setSaveError(null);
      const c = await putConfig({ daily_linkedin_limit: clamped });
      applyConfig(c, { syncStorage: true, mongoUserId });
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Save failed");
    }
  };

  const [enhancedPreview, setEnhancedPreview] = useState<string | null>(null);
  const [referenceFiles, setReferenceFiles] = useState<RefFile[]>([]);
  const [isAttachingFiles, setIsAttachingFiles] = useState(false);
  const [pendingAttachmentNames, setPendingAttachmentNames] = useState<
    string[]
  >([]);
  const referenceFilesRef = useRef<RefFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    referenceFilesRef.current = referenceFiles;
  }, [referenceFiles]);

  const removeReferenceFile = useCallback((id: string) => {
    setReferenceFiles((prev) => {
      const next = prev.filter((r) => r.id !== id);
      referenceFilesRef.current = next;
      return next;
    });
  }, []);

  const onPickReferenceFiles = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const input = e.currentTarget;
    // Snapshot before clearing: `input.files` is a live list and empties when
    // `value` is reset in many browsers, which would skip reads and leave UI at 0.
    const picked = input.files?.length ? Array.from(input.files) : [];
    input.value = "";
    if (!picked.length) return;
    const names = picked.map((f) => f.name);
    setIsAttachingFiles(true);
    setPendingAttachmentNames(names);
    setSaveError(null);
    const L = STRATEGIC_ENHANCE_DEFAULTS;
    const start = referenceFilesRef.current;
    const acc: RefFile[] = [...start];
    try {
      for (const f of picked) {
        if (acc.length >= L.maxFiles) {
          setSaveError(`At most ${L.maxFiles} reference files`);
          break;
        }
        if (f.size > L.maxFileBytes) {
          setSaveError(
            `${f.name} exceeds ${formatBytes(L.maxFileBytes)} per file`
          );
          break;
        }
        const payload = await readFileAsRefPayload(f);
        const nextTotal =
          acc.reduce((s, r) => s + r.size, 0) + payload.size;
        if (nextTotal > L.maxTotalBytes) {
          setSaveError(
            `Total attachments would exceed ${formatBytes(L.maxTotalBytes)}`
          );
          break;
        }
        acc.push({ id: crypto.randomUUID(), ...payload });
      }
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : "Could not read reference file"
      );
    } finally {
      referenceFilesRef.current = acc;
      setReferenceFiles(acc);
      setIsAttachingFiles(false);
      setPendingAttachmentNames([]);
    }
  };

  const enhance = async () => {
    const trimmed = globalContext.trim();
    const filesForEnhance = referenceFilesRef.current;
    if (!trimmed && filesForEnhance.length === 0) {
      setSaveError(
        "Add strategic identity text and/or at least one reference file."
      );
      return;
    }
    setIsEnhancing(true);
    setSaveError(null);
    setEnhancedPreview(null);
    try {
      const references =
        filesForEnhance.length > 0
          ? filesForEnhance.map((r) => ({
              name: r.name,
              mimeType: r.mimeType,
              ...(r.text !== undefined ? { text: r.text } : {}),
              ...(r.dataBase64 !== undefined ? { dataBase64: r.dataBase64 } : {}),
            }))
          : undefined;
      const res = await fetch("/api/outreach-config/enhance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: trimmed,
          ...(references ? { references } : {}),
        }),
      });
      const data = (await res.json()) as { text?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Enhance failed");
      const next = (data.text ?? "").trim();
      if (!next) throw new Error("Empty result");
      // Show preview — don't overwrite until user accepts
      setEnhancedPreview(next);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Enhance failed");
    } finally {
      setIsEnhancing(false);
    }
  };

  const acceptEnhanced = async () => {
    if (!enhancedPreview) return;
    setGlobalContext(enhancedPreview);
    setEnhancedPreview(null);
    try {
      setSaveError(null);
      const c = await putConfig({ global_context: enhancedPreview });
      applyConfig(c, { syncStorage: true, mongoUserId });
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Save failed");
    }
  };

  const discardEnhanced = () => setEnhancedPreview(null);

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
        Loading your workspace…
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Command Center</h1>
          <p className="mt-1 text-muted-foreground">Define your AI Identity</p>
        </div>
        <span
          className={cn(
            "mt-1.5 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all duration-300",
            savedAt
              ? "bg-green-100 text-green-700 opacity-100 dark:bg-green-900/30 dark:text-green-400"
              : "pointer-events-none opacity-0"
          )}
        >
          <span className="size-1.5 rounded-full bg-green-500" />
          Saved
        </span>
      </div>

      {(loadError ?? saveError) && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {loadError ?? saveError}
        </div>
      )}

      {/* Strategic identity (stored as global_context in API / dp_config.context) */}
      <section className="rounded-xl bg-muted/40 p-5">
        <h2 className="text-base font-semibold">Strategic Identity</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Who you are, how you show up, and the narrative anchor for AI-generated outreach.
        </p>

        <textarea
            value={globalContext}
            onChange={(e) => {
              const v = e.target.value;
              setGlobalContext(v);
              saveContextDebounced(v);
            }}
            onBlur={(e) => {
              const v = e.currentTarget.value;
              if (debounceRef.current) {
                clearTimeout(debounceRef.current);
                debounceRef.current = null;
              }
              void (async () => {
                try {
                  setSaveError(null);
                  const c = await putConfig({ global_context: v });
                  applyConfig(c, { syncStorage: true, mongoUserId });
                } catch (err) {
                  setSaveError(err instanceof Error ? err.message : "Save failed");
                }
              })();
            }}
            rows={8}
            placeholder={PLACEHOLDER_CONTEXT}
            className="mt-4 w-full resize-y rounded-lg border border-input bg-background px-4 py-3 text-sm leading-relaxed outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          />

          <div className="mt-3 rounded-lg border border-border/80 bg-background/60 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-foreground">
                  Reference files (optional)
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Plain text (.txt), Markdown (.md), or PDF — used only when you
                  click Enhance.{" "}
                  <span className="font-medium text-foreground">
                    Not saved to your profile
                  </span>{" "}
                  (re-add after reload if needed).
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Up to {STRATEGIC_ENHANCE_DEFAULTS.maxFiles} files,{" "}
                  {formatBytes(STRATEGIC_ENHANCE_DEFAULTS.maxFileBytes)} each,{" "}
                  {formatBytes(STRATEGIC_ENHANCE_DEFAULTS.maxTotalBytes)} total.
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".txt,.md,.pdf,text/plain,text/markdown,application/pdf"
                  className="sr-only"
                  onChange={(e) => void onPickReferenceFiles(e)}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  disabled={
                    isEnhancing ||
                    enhancedPreview !== null ||
                    isAttachingFiles
                  }
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Paperclip className="size-3.5" aria-hidden />
                  Add files
                </Button>
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {formatBytes(
                    referenceFiles.reduce((s, r) => s + r.size, 0)
                  )}{" "}
                  / {formatBytes(STRATEGIC_ENHANCE_DEFAULTS.maxTotalBytes)} ·{" "}
                  {referenceFiles.length} / {STRATEGIC_ENHANCE_DEFAULTS.maxFiles}
                </span>
              </div>
            </div>

            {/* File chips — rendered inside the box so they're clearly tied to the upload area */}
            {(referenceFiles.length > 0 ||
              isAttachingFiles ||
              pendingAttachmentNames.length > 0) && (
              <div
                className="mt-3 flex flex-wrap items-center gap-2"
                aria-label="Attached reference files"
              >
                {referenceFiles.map((r) => {
                  const isPdf = Boolean(r.dataBase64);
                  const FileIcon = isPdf ? File : FileText;
                  return (
                    <div
                      key={r.id}
                      className={cn(
                        "group inline-flex max-w-full items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 py-1 pl-2 pr-0.5 text-xs text-foreground shadow-sm",
                        (isAttachingFiles || isEnhancing || enhancedPreview !== null) &&
                          "pointer-events-none opacity-60"
                      )}
                    >
                      <FileIcon
                        className="size-3.5 shrink-0 text-primary"
                        aria-hidden
                      />
                      <span
                        className="max-w-[12rem] truncate font-medium"
                        title={r.name}
                      >
                        {r.name}
                      </span>
                      <span className="shrink-0 tabular-nums text-[10px] text-muted-foreground">
                        {formatBytes(r.size)}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        className="size-6 shrink-0 rounded-full text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
                        aria-label={`Remove ${r.name}`}
                        disabled={
                          isAttachingFiles ||
                          isEnhancing ||
                          enhancedPreview !== null
                        }
                        onClick={() => removeReferenceFile(r.id)}
                      >
                        <X className="size-3" />
                      </Button>
                    </div>
                  );
                })}
                {isAttachingFiles &&
                  pendingAttachmentNames.map((name, i) => (
                    <div
                      key={`pending-${i}-${name}`}
                      className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-dashed border-muted-foreground/40 bg-muted/50 py-1 pl-2.5 pr-2 text-xs text-muted-foreground"
                    >
                      <Loader2
                        className="size-3.5 shrink-0 animate-spin text-primary"
                        aria-hidden
                      />
                      <span className="max-w-[12rem] truncate" title={name}>
                        {name}
                      </span>
                      <span className="shrink-0 text-[10px]">Reading…</span>
                    </div>
                  ))}
              </div>
            )}
          </div>

          <div className="mt-2 flex justify-end">
            <Button
              type="button"
              size="default"
              className={cn(
                "h-9 gap-2 rounded-full px-5 font-medium shadow-md shadow-primary/20",
                "transition-[box-shadow,transform,background-color] duration-200 ease-out",
                "hover:shadow-lg hover:shadow-primary/30 hover:-translate-y-px",
                "active:translate-y-0 active:scale-[0.98]",
                "disabled:hover:translate-y-0 disabled:hover:shadow-md disabled:active:scale-100"
              )}
              disabled={isEnhancing || enhancedPreview !== null}
              onClick={() => void enhance()}
            >
              {isEnhancing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Wand2 className="size-4" />
              )}
              {isEnhancing ? "Enhancing…" : "Enhance"}
            </Button>
          </div>

        {enhancedPreview !== null && (
          <div className="mt-4 rounded-lg border border-primary/30 bg-primary/5 p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-primary">
              Enhanced preview — review before accepting
            </p>
            <p className="whitespace-pre-wrap rounded-md bg-background p-3 text-sm leading-relaxed text-foreground ring-1 ring-border">
              {enhancedPreview}
            </p>
            <div className="mt-3 flex justify-end gap-2">
              <Button
                type="button"
                size="sm"
                className="rounded-full px-4"
                onClick={() => void acceptEnhanced()}
              >
                Accept
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="rounded-full px-4"
                onClick={discardEnhanced}
              >
                Discard
              </Button>
            </div>
          </div>
        )}
      </section>

      {/* Tone + Daily Limit collapsed into one row */}
      <section className="rounded-xl bg-muted/40 p-5">
        <div className="grid grid-cols-2 gap-5">
          {/* Left: Tone cards */}
          <div>
            <h2 className="text-base font-semibold">Communication Tone</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Select how your AI should communicate with prospects.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {toneOptions.map((opt) => {
                const Icon = opt.icon;
                const selected = tone === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => void persistTone(opt.id)}
                    className={cn(
                      "flex flex-col items-start gap-2 rounded-xl border-2 p-3 text-left transition-colors",
                      selected
                        ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                        : "border-border hover:border-muted-foreground/30 hover:bg-muted/30"
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-10 items-center justify-center rounded-lg",
                        selected
                          ? "bg-primary/15 text-primary"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      <Icon className="size-5" />
                    </span>
                    <span className="block font-medium">{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right: Daily limit slider */}
          <div>
            <h2 className="text-base font-semibold">Daily Safety Limits</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Configure your LinkedIn outreach boundaries.
            </p>
            <div className="mt-6 space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">LinkedIn Outreach Limit</span>
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums transition-colors",
                    dailyLimit <= 7
                      ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                      : dailyLimit <= 14
                        ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                        : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                  )}
                >
                  <span
                    className={cn(
                      "size-1.5 rounded-full",
                      dailyLimit <= 7
                        ? "bg-green-500"
                        : dailyLimit <= 14
                          ? "bg-amber-500"
                          : "bg-red-500"
                    )}
                  />
                  {dailyLimit} / {DAILY_SLIDER_MAX} per day ·{" "}
                  {dailyLimit <= 7 ? "Safe" : dailyLimit <= 14 ? "Moderate" : "High Risk"}
                </span>
              </div>
              <input
                type="range"
                min={1}
                max={DAILY_SLIDER_MAX}
                step={1}
                value={dailyLimit}
                onChange={(e) => setDailyLimit(Number(e.target.value))}
                onPointerUp={(e) => {
                  const t = e.currentTarget;
                  void persistDaily(Number(t.value));
                }}
                className={cn(
                  "h-2 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary",
                  "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:size-4",
                  "[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-primary [&::-webkit-slider-thumb]:bg-background [&::-webkit-slider-thumb]:shadow",
                  "[&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-primary [&::-moz-range-thumb]:bg-background"
                )}
                aria-valuemin={1}
                aria-valuemax={DAILY_SLIDER_MAX}
                aria-valuenow={dailyLimit}
                aria-label="Daily LinkedIn outreach limit"
              />
              {/* Color-coded zone bar */}
              <div className="flex h-1 w-full overflow-hidden rounded-full">
                <div className="h-full bg-green-400 dark:bg-green-600" style={{ width: `${(7 / DAILY_SLIDER_MAX) * 100}%` }} />
                <div className="h-full bg-amber-400 dark:bg-amber-500" style={{ width: `${(7 / DAILY_SLIDER_MAX) * 100}%` }} />
                <div className="h-full flex-1 bg-red-400 dark:bg-red-600" />
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-green-600 dark:text-green-400">Safe (1–7)</span>
                <span className="text-amber-600 dark:text-amber-400">Moderate (8–14)</span>
                <span className="text-red-600 dark:text-red-400">High Risk (15–20)</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Setup complete CTA */}
      {globalContext.trim() && (
        <Link
          href="/prospecting"
          className={cn(buttonVariants({ variant: "default" }), "w-full")}
        >
          Start prospecting
        </Link>
      )}
    </div>
  );
}
