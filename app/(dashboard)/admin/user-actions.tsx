"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api-client";
import type { AdminUserRow } from "@/lib/admin-users";

/**
 * Sign out / suspend / delete for one user. Delete is only offered once the user is suspended, and asks for their name:
 * the server enforces both, this just keeps the happy path obvious.
 */
export function UserActions({ user, onChanged }: { user: AdminUserRow; onChanged: () => void }) {
  const [busy, setBusy] = useState<"sign-out" | "suspend" | "delete" | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmName, setConfirmName] = useState("");

  async function run(kind: "sign-out" | "suspend" | "delete", call: () => Promise<unknown>, done: string) {
    setBusy(kind);
    try {
      await call();
      toast.success(done);
      setDeleteOpen(false);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "That didn't work.");
    } finally {
      setBusy(null);
    }
  }

  const base = `/api/admin/users/${user.id}`;

  return (
    <div className="flex flex-wrap justify-end gap-2">
      <Button
        size="sm"
        variant="outline"
        loading={busy === "sign-out"}
        disabled={busy !== null}
        onClick={() => void run("sign-out", () => apiFetch(`${base}/sign-out`, { method: "POST", body: {} }), `Signed ${user.name} out everywhere.`)}
      >
        Sign out
      </Button>
      <Button
        size="sm"
        variant="outline"
        loading={busy === "suspend"}
        disabled={busy !== null}
        onClick={() =>
          void run(
            "suspend",
            () => apiFetch(`${base}/suspend`, { method: "POST", body: { suspended: !user.suspended } }),
            user.suspended ? `${user.name} can use the dashboard again.` : `${user.name} is suspended.`
          )
        }
      >
        {user.suspended ? "Unsuspend" : "Suspend"}
      </Button>
      {user.suspended && (
        <Button size="sm" variant="danger" disabled={busy !== null} onClick={() => { setConfirmName(""); setDeleteOpen(true); }}>
          Delete…
        </Button>
      )}

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogTitle>Delete {user.name}?</DialogTitle>
          <DialogDescription>
            This removes their linked Telegram accounts, bots, channels/groups, messages and templates from this dashboard,
            and can&apos;t be undone. The bots themselves are not deleted on Telegram. Type their name to confirm.
          </DialogDescription>
          <Input
            value={confirmName}
            onChange={(e) => setConfirmName(e.target.value)}
            placeholder={user.name}
            aria-label={`Type ${user.name} to confirm`}
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={busy === "delete"}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={busy === "delete"}
              disabled={confirmName.trim() !== user.name}
              onClick={() => void run("delete", () => apiFetch(base, { method: "DELETE", body: { confirmName } }), `${user.name} was deleted.`)}
            >
              Delete user and data
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
