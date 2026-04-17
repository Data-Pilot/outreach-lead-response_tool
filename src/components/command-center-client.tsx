"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Briefcase, Coffee, Loader2, Wand2, Zap } from "lucide-react";
import Link from "next/link";
import { useSession } from "next-auth/react";

import { Button, buttonVariants } from "@/components/ui/button";
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
      if (sessionStatus !== "loading") setIsLoading(false);
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
        const needApi =
          switched ||
          !local ||
          !local.context.trim() ||
          (Boolean(local.mongo_user_id) &&
            local.mongo_user_id !== mongoUserId);

        if (needApi) {
          const c = await fetchConfig(ac.signal);
          if (cancelled) return;
          let next = c;
          const serverCtx = (c.global_context ?? "").trim();
          if (!serverCtx && local?.context.trim()) {
            next = { ...c, global_context: local.context };
          }
          applyConfig(next, {
            syncStorage: true,
            showSaved: false,
            mongoUserId,
          });
        } else {
          if (cancelled) return;
          applyConfig(
            {
              global_context: local!.context,
              tone: local!.tone,
              daily_linkedin_limit: local!.daily_linkedin_limit,
              updated_at: null,
            },
            { syncStorage: false, showSaved: false }
          );
        }
      } catch (e) {
        if (!cancelled && process.env.NODE_ENV === "development") {
          console.warn("[CommandCenter] Failed to load config:", e);
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

  const enhance = async () => {
    const trimmed = globalContext.trim();
    if (!trimmed) {
      setSaveError("Add your strategic identity before enhancing.");
      return;
    }
    setIsEnhancing(true);
    setSaveError(null);
    setEnhancedPreview(null);
    try {
      const res = await fetch("/api/outreach-config/enhance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed }),
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
      <div className="flex items-center gap-2 text-muted-foreground">
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

      {/* Strategic identity (stored as global_context in API / dp_config.context) */}
      <section className="rounded-xl bg-muted/40 p-5">
        <h2 className="text-base font-semibold">Strategic Identity</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Who you are, how you show up, and the narrative anchor for AI-generated outreach.
        </p>
        <div className="mt-4">
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
            className="w-full resize-y rounded-lg border border-input bg-background px-4 py-3 text-sm leading-relaxed outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          />
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
