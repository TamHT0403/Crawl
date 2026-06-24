"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2, Sparkles, RotateCcw, BookOpen, Pencil, X, Check, Plus, Trash2 } from "lucide-react";
import type { BrandVoiceProfile } from "@/lib/brandVoice";

export function BrandVoicePanel({ initialProfile }: { initialProfile?: BrandVoiceProfile }) {
  const [profile, setProfile] = useState<BrandVoiceProfile | null>(initialProfile ?? null);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<BrandVoiceProfile | null>(null);

  const loadProfile = () => {
    startTransition(async () => {
      const res = await fetch("/api/brand-voice");
      const data = await res.json();
      setProfile(data);
    });
  };

  useEffect(() => { if (!initialProfile) loadProfile(); }, []);

  const learnFromPosts = () => {
    startTransition(async () => {
      const res = await fetch("/api/brand-voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "learn", postIds: [] }),
      });
      const data = await res.json();
      setProfile(data);
      setMessage("✅ Đã học brand voice từ sample posts!");
    });
  };

  const resetVoice = () => {
    if (!confirm("Reset về brand voice mặc định?")) return;
    startTransition(async () => {
      await fetch("/api/brand-voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset" }),
      });
      loadProfile();
      setMessage("✅ Đã reset về mặc định.");
    });
  };

  // ─── Edit helpers ──────────────────────────────────────────────────────

  const startEdit = () => {
    setDraft(JSON.parse(JSON.stringify(profile!)));
    setEditing(true);
    setMessage("");
  };

  const cancelEdit = () => {
    setDraft(null);
    setEditing(false);
    setMessage("");
  };

  const saveEdit = () => {
    if (!draft) return;
    startTransition(async () => {
      const res = await fetch("/api/brand-voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save", profile: draft }),
      });
      if (res.ok) {
        setProfile(draft);
        setEditing(false);
        setDraft(null);
        setMessage("✅ Đã lưu brand voice!");
      } else {
        setMessage("❌ Lỗi khi lưu brand voice.");
      }
    });
  };

  // ─── Draft array helpers ───────────────────────────────────────────────

  const updateDraft = (patch: Partial<BrandVoiceProfile>) => {
    setDraft((prev) => prev ? { ...prev, ...patch } : prev);
  };

  const addArrayItem = (field: "traits" | "avoid") => {
    if (!draft) return;
    const val = prompt(field === "traits" ? "Thêm đặc điểm:" : "Thêm nguyên tắc:");
    if (!val?.trim()) return;
    updateDraft({ [field]: [...draft[field], val.trim()] });
  };

  const removeArrayItem = (field: "traits" | "avoid", index: number) => {
    if (!draft) return;
    const arr = [...draft[field]];
    arr.splice(index, 1);
    updateDraft({ [field]: arr });
  };

  const addRule = (platformIdx: number) => {
    if (!draft) return;
    const val = prompt("Thêm quy tắc:");
    if (!val?.trim()) return;
    const rules = [...draft.toneRules];
    rules[platformIdx] = { ...rules[platformIdx], rules: [...rules[platformIdx].rules, val.trim()] };
    updateDraft({ toneRules: rules });
  };

  const removeRule = (platformIdx: number, ruleIdx: number) => {
    if (!draft) return;
    const rules = [...draft.toneRules];
    const arr = [...rules[platformIdx].rules];
    arr.splice(ruleIdx, 1);
    rules[platformIdx] = { ...rules[platformIdx], rules: arr };
    updateDraft({ toneRules: rules });
  };

  const updateRule = (platformIdx: number, ruleIdx: number, value: string) => {
    if (!draft) return;
    const rules = [...draft.toneRules];
    const arr = [...rules[platformIdx].rules];
    arr[ruleIdx] = value;
    rules[platformIdx] = { ...rules[platformIdx], rules: arr };
    updateDraft({ toneRules: rules });
  };

  const renamePlatform = (idx: number, name: string) => {
    if (!draft) return;
    const rules = [...draft.toneRules];
    rules[idx] = { ...rules[idx], platform: name };
    updateDraft({ toneRules: rules });
  };

  if (!profile) return <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-kolia-green" /></div>;

  // Data to render (draft when editing, profile otherwise)
  const data = editing && draft ? draft : profile;
  const traits = data.traits ?? [];
  const avoid = data.avoid ?? [];
  const toneRules = data.toneRules ?? [];
  const samplePosts = data.samplePosts ?? [];

  return (
    <div className="space-y-6">
      {message && (
        <div className="rounded bg-green-50 p-3 text-sm text-green-700 border border-green-200">{message}</div>
      )}

      {/* Actions bar */}
      {!editing ? (
        <div className="flex gap-2">
          <button onClick={learnFromPosts} className="flex items-center gap-1 rounded bg-kolia-green px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700">
            <Sparkles className="h-3 w-3" /> Học từ posts
          </button>
          <button onClick={resetVoice} className="flex items-center gap-1 rounded border px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">
            <RotateCcw className="h-3 w-3" /> Reset
          </button>
          <button onClick={startEdit} className="flex items-center gap-1 rounded border border-blue-300 px-3 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-50">
            <Pencil className="h-3 w-3" /> Chỉnh sửa
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <button onClick={saveEdit} className="flex items-center gap-1 rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700">
            <Check className="h-3 w-3" /> Lưu
          </button>
          <button onClick={cancelEdit} className="flex items-center gap-1 rounded border px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">
            <X className="h-3 w-3" /> Huỷ
          </button>
        </div>
      )}

      {/* Profile Card */}
      <section className="rounded border border-kolia-line bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <BookOpen className="h-5 w-5 text-kolia-green" />
            <div className="min-w-0 flex-1">
              {editing ? (
                <div className="space-y-2">
                  <input
                    value={draft?.name ?? ""}
                    onChange={(e) => updateDraft({ name: e.target.value })}
                    className="w-full rounded border border-kolia-line px-3 py-1.5 text-sm font-bold"
                  />
                  <textarea
                    value={draft?.description ?? ""}
                    onChange={(e) => updateDraft({ description: e.target.value })}
                    rows={3}
                    className="w-full rounded border border-kolia-line px-3 py-1.5 text-sm"
                  />
                </div>
              ) : (
                <>
                  <h2 className="font-bold text-kolia-ink">{data.name}</h2>
                  <p className="text-sm text-slate-500">{data.description}</p>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Traits */}
      <section className="rounded border border-kolia-line bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-kolia-ink">✨ Đặc điểm giọng văn</h3>
          {editing && (
            <button onClick={() => addArrayItem("traits")} className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800">
              <Plus className="h-3 w-3" /> Thêm
            </button>
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {traits.map((t, i) =>
            editing ? (
              <span key={i} className="inline-flex items-center gap-1 rounded-full bg-kolia-mint px-3 py-1 text-xs font-semibold text-kolia-green">
                <input
                  value={t}
                  onChange={(e) => {
                    const arr = [...traits];
                    arr[i] = e.target.value;
                    updateDraft({ traits: arr });
                  }}
                  className="w-20 bg-transparent outline-none"
                />
                <button onClick={() => removeArrayItem("traits", i)} className="text-red-400 hover:text-red-600"><X className="h-3 w-3" /></button>
              </span>
            ) : (
              <span key={t} className="rounded-full bg-kolia-mint px-3 py-1 text-xs font-semibold text-kolia-green">{t}</span>
            )
          )}
        </div>
      </section>

      {/* Rules to Avoid */}
      <section className="rounded border border-kolia-line bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-kolia-ink">⛔ Nguyên tắc cần tránh</h3>
          {editing && (
            <button onClick={() => addArrayItem("avoid")} className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800">
              <Plus className="h-3 w-3" /> Thêm
            </button>
          )}
        </div>
        <ul className="mt-3 space-y-2">
          {avoid.map((a, i) =>
            editing ? (
              <li key={i} className="flex items-center gap-2 text-sm text-slate-600">
                <span className="text-red-400">✕</span>
                <input
                  value={a}
                  onChange={(e) => {
                    const arr = [...avoid];
                    arr[i] = e.target.value;
                    updateDraft({ avoid: arr });
                  }}
                  className="flex-1 rounded border border-kolia-line px-2 py-1 text-sm"
                />
                <button onClick={() => removeArrayItem("avoid", i)} className="text-red-400 hover:text-red-600"><Trash2 className="h-3 w-3" /></button>
              </li>
            ) : (
              <li key={a} className="flex gap-2 text-sm text-slate-600"><span className="text-red-400">✕</span>{a}</li>
            )
          )}
        </ul>
      </section>

      {/* Platform Rules */}
      <section className="rounded border border-kolia-line bg-white p-5 shadow-sm">
        <h3 className="font-bold text-kolia-ink">📋 Quy tắc theo nền tảng</h3>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {toneRules.map((rule, pi) => (
            <div key={pi} className="rounded border border-kolia-line bg-slate-50 p-4">
              {editing ? (
                <input
                  value={rule.platform}
                  onChange={(e) => renamePlatform(pi, e.target.value)}
                  className="mb-2 w-full rounded border px-2 py-1 text-sm font-bold uppercase"
                />
              ) : (
                <p className="text-sm font-bold uppercase text-kolia-green">{rule.platform}</p>
              )}
              <ul className="mt-2 space-y-1">
                {rule.rules.map((r, ri) =>
                  editing ? (
                    <li key={ri} className="flex items-start gap-1">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-kolia-gold" />
                      <input
                        value={r}
                        onChange={(e) => updateRule(pi, ri, e.target.value)}
                        className="min-w-0 flex-1 rounded border border-kolia-line px-1.5 py-0.5 text-xs"
                      />
                      <button onClick={() => removeRule(pi, ri)} className="mt-0.5 text-red-400 hover:text-red-600"><X className="h-3 w-3" /></button>
                    </li>
                  ) : (
                    <li key={ri} className="flex gap-2 text-xs text-slate-600">
                      <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-kolia-gold" />
                      {r}
                    </li>
                  )
                )}
              </ul>
              {editing && (
                <button onClick={() => addRule(pi)} className="mt-2 flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800">
                  <Plus className="h-3 w-3" /> Thêm quy tắc
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Sample Posts */}
      {samplePosts.length > 0 && (
        <section className="rounded border border-kolia-line bg-white p-5 shadow-sm">
          <h3 className="font-bold text-kolia-ink">📝 Bài viết tham khảo</h3>
          <ul className="mt-3 space-y-2">
            {samplePosts.map((s, i) => (
              <li key={i} className="flex gap-2 text-sm text-slate-600"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-kolia-gold" />{s}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
