"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Eye,
  EyeOff,
  Info,
  Loader2,
  Plus,
  ShieldCheck,
  Trash2,
  XCircle
} from "lucide-react";
import { cn } from "@/lib/utils";

type FacebookAccountRow = {
  id: string;
  label: string;
  isDefault: boolean;
  isValid: boolean;
  lastValidated: string | null;
  createdAt: string;
  updatedAt: string;
};

export function FacebookAccountManager() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [accounts, setAccounts] = useState<FacebookAccountRow[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [sessionJson, setSessionJson] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [status, setStatus] = useState("");
  const [showSession, setShowSession] = useState(false);
  const [validating, setValidating] = useState(false);

  const loadAccounts = useCallback(() => {
    fetch("/api/facebook/accounts")
      .then((res) => res.json())
      .then((data) => setAccounts(data.accounts ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  const resetForm = () => {
    setEditingId(null);
    setLabel("");
    setSessionJson("");
    setIsDefault(false);
    setShowForm(false);
    setShowSession(false);
    setStatus("");
  };

  const openEdit = (account: FacebookAccountRow) => {
    setEditingId(account.id);
    setLabel(account.label);
    setSessionJson("");
    setIsDefault(account.isDefault);
    setShowForm(true);
    setStatus("");
  };

  const save = () => {
    if (!label.trim()) {
      setStatus("⚠️ Vui lòng nhập tên gợi nhớ");
      return;
    }
    if (!editingId && !sessionJson.trim()) {
      setStatus("⚠️ Vui lòng dán session JSON");
      return;
    }

    setValidating(true);
    setStatus("🔄 Đang validate session với Facebook...");
    startTransition(async () => {
      try {
        const method = editingId ? "PUT" : "POST";
        const url = editingId
          ? `/api/facebook/accounts/${editingId}`
          : "/api/facebook/accounts";

        const res = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            label: label.trim(),
            sessionData: sessionJson.trim() || undefined,
            isDefault
          })
        });

        const data = await res.json();

        if (!res.ok) {
          setStatus(`❌ ${data.error || "Lỗi không xác định"}`);
          return;
        }

        setStatus(
          data.validation
            ? `✅ Đã lưu. ${data.validation}`
            : "✅ Đã lưu thành công"
        );
        resetForm();
        loadAccounts();
        router.refresh();
      } catch {
        setStatus("❌ Lỗi kết nối, vui lòng thử lại");
      } finally {
        setValidating(false);
      }
    });
  };

  const deleteAccount = (id: string) => {
    if (!confirm("Xoá account này?")) return;
    startTransition(async () => {
      await fetch(`/api/facebook/accounts/${id}`, { method: "DELETE" });
      loadAccounts();
      router.refresh();
    });
  };

  return (
    <div className="rounded-lg border border-kolia-line bg-slate-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-[0.1em] text-kolia-green">
            📘 Facebook Accounts
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            Quản lý session Facebook để crawl dữ liệu. Account có <strong>IsDefault</strong>{" "}
            sẽ được dùng khi đồng bộ. Thay thế cho cách đăng nhập bằng email/password.
          </p>
        </div>
        <button
          type="button"
          onClick={() => { resetForm(); setShowForm(true); }}
          className="inline-flex items-center gap-1.5 rounded bg-kolia-green px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700"
        >
          <Plus className="h-3.5 w-3.5" />
          Thêm account
        </button>
      </div>

      {/* Instruction box */}
      {!showForm && accounts.length === 0 && (
        <div className="mt-4 rounded border border-amber-200 bg-amber-50 p-4 text-xs leading-6 text-amber-800">
          <strong className="flex items-center gap-1.5">
            <Info className="h-3.5 w-3.5" />
            Cách lấy Facebook Session Cookies:
          </strong>
          <ol className="mt-2 list-decimal space-y-1 pl-4">
            <li>Mở <strong>Microsoft Edge</strong> (hoặc Chrome)</li>
            <li>Đăng nhập <strong>https://www.facebook.com</strong></li>
            <li>F12 → Tab <strong>Application</strong> (hoặc Cookies)</li>
            <li>Ở mục <strong>Storage</strong> → <strong>Cookies</strong> → Chọn <strong>https://www.facebook.com</strong></li>
            <li>
              <strong>Cách 1 (dễ nhất):</strong> Cài extension{" "}
              <a href="https://www.editthiscookie.com/" target="_blank" rel="noopener noreferrer"
                 className="underline font-semibold">EditThisCookie</a>
              {" "}→ Export cookies → copy JSON
            </li>
            <li>
              <strong>Cách 2:</strong> F12 → Tab <strong>Application</strong> → Cookies →{" "}
              chuột phải 1 cookie → <strong>Show All</strong> → Copy tất cả cookies →{" "}
              dán vào text area bên dưới dạng JSON array
            </li>
          </ol>
          <p className="mt-2 text-amber-700">
            ⚠️ Session có hạn. Nếu hết hạn, hãy export lại từ browser.
          </p>
        </div>
      )}

      {/* List existing accounts */}
      {accounts.length > 0 && (
        <div className="mt-4 space-y-2">
          {accounts.map((account) => (
            <div
              key={account.id}
              className={cn(
                "flex items-center justify-between gap-3 rounded border bg-white p-3 text-sm transition",
                account.isDefault
                  ? "border-kolia-green/50 ring-1 ring-kolia-green/20"
                  : "border-kolia-line"
              )}
            >
              <div className="flex min-w-0 items-center gap-3">
                {/* Status icon */}
                {account.isValid ? (
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-kolia-green" />
                ) : (
                  <XCircle className="h-5 w-5 shrink-0 text-red-400" />
                )}

                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-semibold text-kolia-ink">
                      {account.label}
                    </span>
                    {account.isDefault && (
                      <span className="shrink-0 rounded bg-kolia-green/10 px-1.5 py-0.5 text-[10px] font-bold text-kolia-green">
                        DEFAULT
                      </span>
                    )}
                    <span
                      className={cn(
                        "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold",
                        account.isValid
                          ? "bg-green-50 text-green-700"
                          : "bg-red-50 text-red-600"
                      )}
                    >
                      {account.isValid ? "Valid" : "Invalid"}
                    </span>
                  </div>
                  {account.lastValidated && (
                    <p className="mt-0.5 text-xs text-slate-400">
                      Validated: {new Date(account.lastValidated).toLocaleString("vi-VN")}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex shrink-0 gap-1">
                <button
                  type="button"
                  onClick={() => openEdit(account)}
                  className="rounded px-2.5 py-1.5 text-xs font-semibold text-kolia-ink hover:bg-slate-100"
                >
                  Sửa
                </button>
                <button
                  type="button"
                  onClick={() => deleteAccount(account.id)}
                  className="rounded px-2.5 py-1.5 text-xs text-red-600 hover:bg-red-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit form */}
      {showForm && (
        <div className="mt-4 space-y-4 rounded border border-kolia-line bg-white p-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700">
              Tên gợi nhớ
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="VD: Account Facebook phụ"
                className="mt-1.5 h-10 w-full rounded border border-kolia-line px-3 text-sm outline-none focus:border-kolia-green focus:ring-2 focus:ring-kolia-mint"
              />
            </label>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700">
              <div className="flex items-center gap-2">
                <span>Session / Cookies JSON</span>
                <button
                  type="button"
                  onClick={() => setShowSession(!showSession)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  {showSession ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
                {editingId && (
                  <span className="text-xs font-normal text-slate-400">(bỏ trống nếu giữ nguyên)</span>
                )}
              </div>
              <textarea
                value={sessionJson}
                onChange={(e) => setSessionJson(e.target.value)}
                placeholder='[{"name":"c_user","value":"1000...","domain":".facebook.com","path":"/"}, ...]'
                rows={5}
                className="mt-1.5 w-full rounded border border-kolia-line px-3 py-2 text-xs font-mono outline-none focus:border-kolia-green focus:ring-2 focus:ring-kolia-mint"
              />
            </label>
          </div>

          <label className="flex items-center gap-3 rounded border border-kolia-line p-3 text-sm font-semibold text-slate-700">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="h-4 w-4 text-kolia-green"
            />
            <ShieldCheck className="h-4 w-4 text-kolia-green" />
            Đặt làm account mặc định — dùng cho crawl
          </label>

          {status && (
            <p
              className={cn(
                "rounded px-3 py-2 text-xs font-semibold",
                status.startsWith("✅")
                  ? "bg-kolia-mint text-kolia-green"
                  : status.startsWith("❌") || status.startsWith("⚠️")
                    ? "bg-red-50 text-red-700"
                    : "bg-blue-50 text-blue-700"
              )}
            >
              {status}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={save}
              disabled={isPending || validating}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded bg-kolia-green px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
            >
              {validating && <Loader2 className="h-4 w-4 animate-spin" />}
              {validating ? "Đang validate..." : editingId ? "Cập nhật" : "Thêm & Validate"}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="rounded border border-kolia-line px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            >
              Huỷ
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
