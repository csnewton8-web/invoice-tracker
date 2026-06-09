"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

type Member = {
  id: string;
  user_id: string;
  email: string | null;
  name: string | null;
  role: string;
  is_active: boolean;
  created_at: string;
};

type Invitation = {
  id: string;
  email: string;
  role: string;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
};

async function readJsonResponse(res: Response) {
  const text = await res.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Invalid server response");
  }
}

export default function TeamSettingsPage() {
  const supabase = useMemo(() => createClient(), []);

  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function getAccessToken() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      window.location.href = "/login";
      return null;
    }

    return session.access_token;
  }

  async function loadTeam() {
    setLoading(true);
    setError("");

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) return;

      const res = await fetch("/api/team/list", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        cache: "no-store",
      });

      const data = await readJsonResponse(res);

      if (!res.ok) {
        throw new Error(data?.error || "Failed to load team");
      }

      setMembers(data?.members || []);
      setInvitations(data?.invitations || []);
    } catch (err: any) {
      setError(err.message || "Failed to load team");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTeam();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function inviteMember(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) return;

      const res = await fetch("/api/team/send-invite", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ email, role }),
      });

      const data = await readJsonResponse(res);

      if (!res.ok) {
        throw new Error(data?.error || "Failed to invite member");
      }

      setEmail("");
      setRole("member");
      setMessage(
        data?.invite_url
          ? `Invitation email sent. Dev link: ${data.invite_url}`
          : "Invitation email sent."
      );

      await loadTeam();
    } catch (err: any) {
      setError(err.message || "Failed to invite member");
    } finally {
      setSaving(false);
    }
  }

  async function resendInvitation(invitationId: string) {
    setError("");
    setMessage("");

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) return;

      const res = await fetch("/api/team/resend-invite", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ invitationId }),
      });

      const data = await readJsonResponse(res);

      if (!res.ok) {
        throw new Error(data?.error || "Failed to resend invite");
      }

      setMessage("Invitation resent.");
    } catch (err: any) {
      setError(err.message || "Failed to resend invite");
    }
  }

  async function changeRole(membershipId: string, newRole: string) {
    setError("");
    setMessage("");

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) return;

      const res = await fetch("/api/team/change-role", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ membershipId, role: newRole }),
      });

      const data = await readJsonResponse(res);

      if (!res.ok) {
        throw new Error(data?.error || "Failed to change role");
      }

      setMessage("Role updated.");
      await loadTeam();
    } catch (err: any) {
      setError(err.message || "Failed to change role");
    }
  }

  async function removeMember(membershipId: string) {
    const confirmed = window.confirm(
      "Remove this team member from the company?"
    );

    if (!confirmed) return;

    setError("");
    setMessage("");

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) return;

      const res = await fetch("/api/team/remove", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ membershipId }),
      });

      const data = await readJsonResponse(res);

      if (!res.ok) {
        throw new Error(data?.error || "Failed to remove member");
      }

      setMessage("Team member removed.");
      await loadTeam();
    } catch (err: any) {
      setError(err.message || "Failed to remove member");
    }
  }

  async function cancelInvitation(invitationId: string) {
    const confirmed = window.confirm("Cancel this invitation?");

    if (!confirmed) return;

    setError("");
    setMessage("");

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) return;

      const res = await fetch("/api/team/cancel-invite", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ invitationId }),
      });

      const data = await readJsonResponse(res);

      if (!res.ok) {
        throw new Error(data?.error || "Failed to cancel invitation");
      }

      setMessage("Invitation cancelled.");
      await loadTeam();
    } catch (err: any) {
      setError(err.message || "Failed to cancel invitation");
    }
  }

  return (
    <main className="min-h-screen bg-[#020817] px-6 py-8 text-white">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="rounded-[32px] border border-slate-800 bg-slate-900 px-6 py-6 shadow-2xl shadow-blue-500/5">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="inline-flex rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-blue-200">
                Team settings
              </div>

              <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white">
                Manage team access
              </h1>

              <p className="mt-2 text-sm text-slate-400">
                Invite users, manage roles, and control access to your FlashFox
                workspace.
              </p>
            </div>

            <div className="flex gap-3">
              <Link
                href="/settings"
                className="rounded-2xl border border-slate-700 px-4 py-2 text-sm text-slate-200 transition hover:bg-slate-800"
              >
                Back to settings
              </Link>

              <Link
                href="/invoices"
                className="rounded-2xl border border-slate-700 px-4 py-2 text-sm text-slate-200 transition hover:bg-slate-800"
              >
                Back to workspace
              </Link>
            </div>
          </div>
        </div>

        {error ? (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
            {error}
          </div>
        ) : null}

        {message ? (
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">
            {message}
          </div>
        ) : null}

        <section className="rounded-[30px] border border-slate-800 bg-slate-900 p-6 shadow-xl shadow-black/10">
          <div className="text-sm uppercase tracking-[0.14em] text-slate-500">
            Invite
          </div>

          <h2 className="mt-3 text-2xl font-semibold text-white">
            Invite a team member
          </h2>

          <p className="mt-2 text-sm text-slate-400">
            Send a secure invitation email and assign the user an initial role.
          </p>

          <form onSubmit={inviteMember} className="mt-5 grid gap-4 md:grid-cols-3">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com"
              className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 md:col-span-2"
            />

            <select
  value={role}
  onChange={(e) => setRole(e.target.value)}
  className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
>
  <option value="admin">Admin</option>
  <option value="member">Member</option>
  <option value="viewer">Viewer</option>
</select>

<div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4 text-sm text-slate-300 md:col-span-3">
  <div className="mb-3 font-medium text-white">
    Access rights
  </div>

  <div className="grid gap-4 md:grid-cols-4">
    <div>
      <div className="font-medium text-blue-200">
        Owner
      </div>

      <p className="mt-1 text-xs leading-5 text-slate-400">
        Full workspace control, including billing, subscription,
        team management, company settings, and future ownership
        transfer. Owners cannot be invited from this form.
      </p>
    </div>

    <div>
      <div className="font-medium text-blue-200">
        Admin
      </div>

      <p className="mt-1 text-xs leading-5 text-slate-400">
        Can manage invoices, reminders, recipients,
        payment links, settings, and team members.
        Cannot access owner-only billing controls.
      </p>
    </div>

    <div>
      <div className="font-medium text-blue-200">
        Member
      </div>

      <p className="mt-1 text-xs leading-5 text-slate-400">
        Can upload, edit, delete, and mark invoices
        as paid. Cannot manage team members,
        billing, or workspace settings.
      </p>
    </div>

    <div>
      <div className="font-medium text-blue-200">
        Viewer
      </div>

      <p className="mt-1 text-xs leading-5 text-slate-400">
        Can view invoices and workspace data only.
        Cannot upload, edit, delete, send reminders,
        or change settings.
      </p>
    </div>
  </div>
</div>

<button
  type="submit"
              disabled={saving}
              className="rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60 md:col-span-3"
            >
              {saving ? "Sending invitation..." : "Send invitation"}
            </button>
          </form>
        </section>

        <section className="rounded-[30px] border border-slate-800 bg-slate-900 p-6 shadow-xl shadow-black/10">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm uppercase tracking-[0.14em] text-slate-500">
                Members
              </div>

              <h2 className="mt-3 text-2xl font-semibold text-white">
                Active members
              </h2>
            </div>

            <div className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300">
              {members.length} active
            </div>
          </div>

          {loading ? (
            <p className="mt-5 text-sm text-slate-400">Loading team...</p>
          ) : members.length === 0 ? (
            <p className="mt-5 text-sm text-slate-400">
              No team members found.
            </p>
          ) : (
            <div className="mt-5 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-500">
                    <th className="py-3 font-medium">Member</th>
                    <th className="py-3 font-medium">Role</th>
                    <th className="py-3 font-medium">Joined</th>
                    <th className="py-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {members.map((member) => (
                    <tr key={member.id} className="border-b border-slate-800">
                      <td className="py-4">
                        <div className="font-medium text-white">
                          {member.name || member.email || "Unknown user"}
                        </div>
                        <div className="text-xs text-slate-500">
                          {member.email || member.user_id}
                        </div>
                      </td>

                      <td className="py-4">
                        {member.role === "owner" ? (
                          <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs font-medium text-blue-200">
                            Owner
                          </span>
                        ) : (
                          <select
                            value={member.role}
                            onChange={(e) =>
                              changeRole(member.id, e.target.value)
                            }
                            className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
                          >
                            <option value="admin">Admin</option>
                            <option value="member">Member</option>
                            <option value="viewer">Viewer</option>
                          </select>
                        )}
                      </td>

                      <td className="py-4 text-slate-400">
                        {new Date(member.created_at).toLocaleDateString()}
                      </td>

                      <td className="py-4 text-right">
                        {member.role !== "owner" ? (
                          <button
                            type="button"
                            onClick={() => removeMember(member.id)}
                            className="rounded-xl border border-rose-500/30 px-3 py-2 text-sm text-rose-200 transition hover:bg-rose-500/10"
                          >
                            Remove
                          </button>
                        ) : (
                          <span className="text-xs text-slate-500">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="rounded-[30px] border border-slate-800 bg-slate-900 p-6 shadow-xl shadow-black/10">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm uppercase tracking-[0.14em] text-slate-500">
                Invitations
              </div>

              <h2 className="mt-3 text-2xl font-semibold text-white">
                Pending invitations
              </h2>
            </div>

            <div className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300">
              {invitations.length} pending
            </div>
          </div>

          {invitations.length === 0 ? (
            <p className="mt-5 text-sm text-slate-400">
              No pending invitations.
            </p>
          ) : (
            <div className="mt-5 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-500">
                    <th className="py-3 font-medium">Email</th>
                    <th className="py-3 font-medium">Role</th>
                    <th className="py-3 font-medium">Expires</th>
                    <th className="py-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {invitations.map((invite) => (
                    <tr key={invite.id} className="border-b border-slate-800">
                      <td className="py-4 text-white">{invite.email}</td>

                      <td className="py-4">
                        <span className="rounded-full border border-slate-700 bg-slate-950 px-3 py-1 text-xs capitalize text-slate-300">
                          {invite.role}
                        </span>
                      </td>

                      <td className="py-4 text-slate-400">
                        {new Date(invite.expires_at).toLocaleDateString()}
                      </td>

                      <td className="py-4 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => resendInvitation(invite.id)}
                            className="rounded-xl border border-slate-700 px-3 py-2 text-sm text-slate-200 transition hover:bg-slate-800"
                          >
                            Resend
                          </button>

                          <button
                            type="button"
                            onClick={() => cancelInvitation(invite.id)}
                            className="rounded-xl border border-rose-500/30 px-3 py-2 text-sm text-rose-200 transition hover:bg-rose-500/10"
                          >
                            Cancel
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}