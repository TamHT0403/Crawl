"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, Key, Loader2, Plus, Shield, Trash2, UserPlus, Users, X } from "lucide-react";

type Team = { id: string; name: string; slug: string; members: Array<{ id: string; email: string; name?: string; role: string }> };
type ApiKeyItem = { id: string; label: string; keyPreview: string; scopes: string; isActive: boolean; lastUsedAt?: string; expiresAt?: string; createdAt: string };

// ─── Modal ─────────────────────────────────────────────────────────────────

function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-kolia-ink">{title}</h3>
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────

export function TeamPanel() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  const [apiKeys, setApiKeys] = useState<ApiKeyItem[]>([]);
  const [newKeyRaw, setNewKeyRaw] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Modal states
  const [createTeamOpen, setCreateTeamOpen] = useState(false);
  const [teamName, setTeamName] = useState("");
  const [teamSlug, setTeamSlug] = useState("");

  const [inviteOpen, setInviteOpen] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("editor");

  const [createKeyOpen, setCreateKeyOpen] = useState(false);
  const [keyLabel, setKeyLabel] = useState("");
  const [keyScope, setKeyScope] = useState("read");

  const [confirmDelete, setConfirmDelete] = useState<{ keyId: string; teamId: string } | null>(null);

  const [saving, setSaving] = useState(false);

  const load = () => {
    startTransition(async () => {
      const res = await fetch("/api/team");
      const data = await res.json();
      setTeams(data.teams ?? []);
    });
  };

  useEffect(() => { load(); }, []);

  const loadKeys = (teamId: string) => {
    setSelectedTeam(teamId);
    startTransition(async () => {
      const res = await fetch(`/api/team?id=${teamId}&action=apikeys`);
      const data = await res.json();
      setApiKeys(data.keys ?? []);
    });
  };

  // ── Create Team ──

  const handleCreateTeam = async () => {
    if (!teamName.trim() || !teamSlug.trim()) return;
    setSaving(true);
    try {
      await fetch("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", name: teamName, slug: teamSlug }),
      });
      setCreateTeamOpen(false);
      setTeamName("");
      setTeamSlug("");
      load();
    } finally {
      setSaving(false);
    }
  };

  // ── Invite Member ──

  const handleInvite = async () => {
    if (!inviteEmail.trim() || !inviteOpen) return;
    setSaving(true);
    try {
      await fetch("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add-member", teamId: inviteOpen, email: inviteEmail, role: inviteRole }),
      });
      setInviteOpen(null);
      setInviteEmail("");
      setInviteRole("editor");
      load();
      if (selectedTeam === inviteOpen) loadKeys(inviteOpen);
    } finally {
      setSaving(false);
    }
  };

  // ── Create API Key ──

  const handleCreateKey = async () => {
    if (!keyLabel.trim() || !selectedTeam) return;
    setSaving(true);
    setNewKeyRaw(null);
    try {
      const res = await fetch("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create-apikey", teamId: selectedTeam, label: keyLabel, scopes: keyScope }),
      });
      const data = await res.json();
      if (data.key) {
        setNewKeyRaw(data.key);
        navigator.clipboard.writeText(data.key);
      }
      setCreateKeyOpen(false);
      setKeyLabel("");
      setKeyScope("read");
      loadKeys(selectedTeam);
    } finally {
      setSaving(false);
    }
  };

  // ── Delete Key ──

  const handleDeleteKey = async () => {
    if (!confirmDelete) return;
    setSaving(true);
    try {
      await fetch("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete-apikey", id: confirmDelete.keyId, teamId: confirmDelete.teamId }),
      });
      setConfirmDelete(null);
      loadKeys(confirmDelete.teamId);
    } finally {
      setSaving(false);
    }
  };

  // ── Slug auto-generate ──

  const handleNameChange = (val: string) => {
    setTeamName(val);
    if (!teamSlug || teamSlug === val.toLowerCase().replace(/[^a-z0-9]/g, "-")) {
      setTeamSlug(val.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/^-+|-+$/g, ""));
    }
  };

  return (
    <div className="space-y-6">
      {/* Teams */}
      <section className="rounded-xl border border-kolia-line bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-green-100">
              <Users className="h-5 w-5 text-kolia-green" />
            </div>
            <div>
              <h2 className="text-base font-bold text-kolia-ink">Teams & Members</h2>
              <p className="text-xs text-slate-500">Quản lý team, phân quyền và API keys</p>
            </div>
          </div>
          <button onClick={() => setCreateTeamOpen(true)} className="flex items-center gap-1.5 rounded-lg bg-kolia-green px-4 py-2 text-sm font-semibold text-white transition hover:bg-green-700">
            <Plus className="h-4 w-4" /> Tạo Team
          </button>
        </div>

        {teams.length === 0 && (
          <div className="mt-4 rounded-lg border border-dashed border-kolia-line py-12 text-center">
            <Users className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-2 text-sm text-slate-400">Chưa có team nào</p>
            <p className="text-xs text-slate-300">Tạo team đầu tiên để bắt đầu</p>
          </div>
        )}

        <div className="mt-4 space-y-3">
          {teams.map((team) => (
            <div key={team.id} className="rounded-xl border border-kolia-line bg-slate-50 p-4 transition hover:border-kolia-green/40">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-kolia-ink">{team.name}</h3>
                  <p className="mt-0.5 text-xs text-slate-500">/{team.slug} · {team.members.length} thành viên</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => { setInviteOpen(team.id); setInviteEmail(""); }} className="flex items-center gap-1.5 rounded-lg border border-kolia-line bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-kolia-mint hover:text-kolia-ink">
                    <UserPlus className="h-3.5 w-3.5" /> Mời
                  </button>
                  <button onClick={() => loadKeys(team.id)} className="flex items-center gap-1.5 rounded-lg border border-kolia-line bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-kolia-mint hover:text-kolia-ink">
                    <Key className="h-3.5 w-3.5" /> API Keys
                  </button>
                </div>
              </div>
              {team.members.length > 0 && (
                <div className="mt-3 space-y-1.5 border-t border-kolia-line pt-3">
                  {team.members.map((m) => (
                    <div key={m.id} className="flex items-center gap-2.5 text-sm text-slate-600">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-kolia-mint text-[10px] font-bold text-kolia-green">
                        {m.email[0].toUpperCase()}
                      </span>
                      <span>{m.email}</span>
                      <span className="ml-auto rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-600">{m.role}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* API Keys */}
      {selectedTeam && (
        <section className="rounded-xl border border-kolia-line bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-100">
                <Shield className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <h2 className="text-base font-bold text-kolia-ink">API Keys</h2>
                <p className="text-xs text-slate-500">Quản lý keys cho team hiện tại</p>
              </div>
            </div>
            <button onClick={() => setCreateKeyOpen(true)} className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-purple-700">
              <Key className="h-4 w-4" /> Tạo Key
            </button>
          </div>

          {newKeyRaw && (
            <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4">
              <p className="text-sm font-bold text-amber-800">🔑 Key mới (chỉ hiện 1 lần)</p>
              <div className="mt-2 flex items-center gap-2 rounded-lg bg-white p-2">
                <code className="flex-1 break-all text-xs">{newKeyRaw}</code>
                <span className="text-xs font-semibold text-green-600">✅ Đã copy!</span>
              </div>
              <p className="mt-2 text-xs text-amber-700">⚠️ Lưu key này ngay. Không thể xem lại sau.</p>
            </div>
          )}

          <div className="mt-4 space-y-2">
            {apiKeys.length === 0 && (
              <div className="rounded-lg border border-dashed border-kolia-line py-10 text-center">
                <Key className="mx-auto h-8 w-8 text-slate-300" />
                <p className="mt-2 text-sm text-slate-400">Chưa có API Key nào</p>
              </div>
            )}
            {apiKeys.map((key) => (
              <div key={key.id} className="flex items-center justify-between rounded-lg border border-kolia-line p-3 transition hover:border-purple-300">
                <div>
                  <p className="text-sm font-semibold text-kolia-ink">{key.label}</p>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                    <span className="font-mono">{key.keyPreview}</span>
                    <span className="text-slate-300">·</span>
                    <span className="font-medium">{key.scopes}</span>
                    <span className="text-slate-300">·</span>
                    <span className={key.isActive ? "text-green-600" : "text-slate-400"}>{key.isActive ? "🟢 Active" : "⚪ Inactive"}</span>
                  </div>
                  {key.lastUsedAt && (
                    <p className="mt-0.5 text-[11px] text-slate-400">Gần nhất: {new Date(key.lastUsedAt).toLocaleDateString("vi-VN")}</p>
                  )}
                </div>
                <button onClick={() => setConfirmDelete({ keyId: key.id, teamId: selectedTeam })} className="flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-semibold text-red-500 transition hover:bg-red-50">
                  <Trash2 className="h-3.5 w-3.5" /> Xoá
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ─── CREATE TEAM MODAL ─── */}
      <Modal open={createTeamOpen} onClose={() => setCreateTeamOpen(false)} title="➕ Tạo Team mới">
        <div className="space-y-4">
          <div>
            <label className="text-sm font-semibold text-kolia-ink">Tên team</label>
            <input
              value={teamName}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="VD: Content Team"
              className="mt-1.5 w-full rounded-lg border border-kolia-line px-3 py-2.5 text-sm outline-none focus:border-kolia-green focus:ring-1 focus:ring-kolia-green"
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-kolia-ink">Slug</label>
            <p className="text-xs text-slate-500">Không dấu, không khoảng trắng. Dùng trong URL và API.</p>
            <input
              value={teamSlug}
              onChange={(e) => setTeamSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
              placeholder="content-team"
              className="mt-1.5 w-full rounded-lg border border-kolia-line px-3 py-2.5 text-sm font-mono outline-none focus:border-kolia-green focus:ring-1 focus:ring-kolia-green"
            />
          </div>
        </div>
        <div className="mt-6 flex items-center justify-between border-t border-kolia-line pt-4">
          <button onClick={() => setCreateTeamOpen(false)} className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100">Huỷ</button>
          <button onClick={handleCreateTeam} disabled={!teamName.trim() || !teamSlug.trim() || saving}
            className="flex items-center gap-2 rounded-lg bg-kolia-green px-5 py-2 text-sm font-bold text-white transition hover:bg-green-700 disabled:opacity-50">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Tạo team
          </button>
        </div>
      </Modal>

      {/* ─── INVITE MEMBER MODAL ─── */}
      <Modal open={inviteOpen !== null} onClose={() => setInviteOpen(null)} title="📧 Mời thành viên">
        <div className="space-y-4">
          <div>
            <label className="text-sm font-semibold text-kolia-ink">Email</label>
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="member@company.com"
              className="mt-1.5 w-full rounded-lg border border-kolia-line px-3 py-2.5 text-sm outline-none focus:border-kolia-green focus:ring-1 focus:ring-kolia-green"
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-kolia-ink">Vai trò</label>
            <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-kolia-line px-3 py-2.5 text-sm outline-none focus:border-kolia-green">
              <option value="admin">Admin — toàn quyền</option>
              <option value="editor">Editor — xem và chỉnh sửa</option>
              <option value="viewer">Viewer — chỉ xem</option>
            </select>
          </div>
        </div>
        <div className="mt-6 flex items-center justify-between border-t border-kolia-line pt-4">
          <button onClick={() => setInviteOpen(null)} className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100">Huỷ</button>
          <button onClick={handleInvite} disabled={!inviteEmail.trim() || saving}
            className="flex items-center gap-2 rounded-lg bg-kolia-green px-5 py-2 text-sm font-bold text-white transition hover:bg-green-700 disabled:opacity-50">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            Gửi lời mời
          </button>
        </div>
      </Modal>

      {/* ─── CREATE API KEY MODAL ─── */}
      <Modal open={createKeyOpen} onClose={() => setCreateKeyOpen(false)} title="🔑 Tạo API Key">
        <div className="space-y-4">
          <div>
            <label className="text-sm font-semibold text-kolia-ink">Tên API Key</label>
            <input
              value={keyLabel}
              onChange={(e) => setKeyLabel(e.target.value)}
              placeholder="VD: Production API"
              className="mt-1.5 w-full rounded-lg border border-kolia-line px-3 py-2.5 text-sm outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-kolia-ink">Scope</label>
            <select value={keyScope} onChange={(e) => setKeyScope(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-kolia-line px-3 py-2.5 text-sm outline-none focus:border-purple-500">
              <option value="read">Read — chỉ đọc dữ liệu</option>
              <option value="write">Write — đọc + ghi</option>
              <option value="admin">Admin — toàn quyền</option>
            </select>
          </div>
        </div>
        <div className="mt-6 flex items-center justify-between border-t border-kolia-line pt-4">
          <button onClick={() => setCreateKeyOpen(false)} className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100">Huỷ</button>
          <button onClick={handleCreateKey} disabled={!keyLabel.trim() || saving}
            className="flex items-center gap-2 rounded-lg bg-purple-600 px-5 py-2 text-sm font-bold text-white transition hover:bg-purple-700 disabled:opacity-50">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Key className="h-4 w-4" />}
            Tạo Key
          </button>
        </div>
      </Modal>

      {/* ─── CONFIRM DELETE MODAL ─── */}
      <Modal open={confirmDelete !== null} onClose={() => setConfirmDelete(null)} title="🗑️ Xác nhận xoá">
        <p className="text-sm leading-6 text-slate-600">
          Bạn có chắc muốn xoá API Key này? Các ứng dụng đang dùng key này sẽ mất quyền truy cập ngay lập tức.
        </p>
        <div className="mt-6 flex items-center justify-end gap-3 border-t border-kolia-line pt-4">
          <button onClick={() => setConfirmDelete(null)} className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100">Giữ lại</button>
          <button onClick={handleDeleteKey} disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-red-600 px-5 py-2 text-sm font-bold text-white transition hover:bg-red-700">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Xoá
          </button>
        </div>
      </Modal>
    </div>
  );
}
