"use client";

import { useState } from "react";

import { createInviteLink, revokeInviteLink, type InviteLink } from "./actions";

const roleLabels = {
  OWNER: "Owner",
  EDITOR: "Editor",
  VIEWER: "Viewer",
};

const expiryOptions = [
  { value: "0", label: "Never expires" },
  { value: "1", label: "Expires in 1 day" },
  { value: "7", label: "Expires in 7 days" },
  { value: "30", label: "Expires in 30 days" },
] as const;

export function InviteLinkManager({
  workspaceId,
  inviteLinks,
}: {
  workspaceId: string;
  inviteLinks: InviteLink[];
}) {
  const [links, setLinks] = useState(inviteLinks);
  const [selectedRole, setSelectedRole] = useState<"EDITOR" | "VIEWER">(
    "EDITOR",
  );
  const [expiryDays, setExpiryDays] = useState<string>("0");
  const [maxUses, setMaxUses] = useState<string>("");

  const handleCreate = async () => {
    const expiresInDays = Number(expiryDays) > 0 ? Number(expiryDays) : null;
    const parsedMaxUses = maxUses.trim() === "" ? null : Number(maxUses);
    const link = await createInviteLink(workspaceId, selectedRole, {
      expiresInDays,
      maxUses:
        parsedMaxUses !== null && Number.isFinite(parsedMaxUses)
          ? parsedMaxUses
          : null,
    });
    setLinks([link, ...links]);
    setMaxUses("");
  };

  const handleRevoke = async (linkId: string) => {
    await revokeInviteLink(linkId);
    setLinks(links.filter((l) => l.id !== linkId));
  };

  const getInviteUrl = (token: string) => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/app/join/${token}`;
  };

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-ds-border-subtle bg-ds-surface-raised p-6">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedRole}
            onChange={(e) =>
              setSelectedRole(e.target.value as "EDITOR" | "VIEWER")
            }
            className="flex-1 rounded-lg border border-ds-border-subtle bg-ds-surface-raised px-3 py-2 text-sm text-ds-text-primary focus:border-ds-border-strong focus:outline-none focus:ring-2 focus:ring-ds-focus-ring/10"
          >
            <option value="EDITOR">Editor</option>
            <option value="VIEWER">Viewer</option>
          </select>
          <select
            value={expiryDays}
            onChange={(e) => setExpiryDays(e.target.value)}
            className="flex-1 rounded-lg border border-ds-border-subtle bg-ds-surface-raised px-3 py-2 text-sm text-ds-text-primary focus:border-ds-border-strong focus:outline-none focus:ring-2 focus:ring-ds-focus-ring/10"
            aria-label="Invite link expiry"
          >
            {expiryOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <input
            type="number"
            min={1}
            value={maxUses}
            onChange={(e) => setMaxUses(e.target.value)}
            placeholder="Max uses"
            aria-label="Maximum uses (leave blank for unlimited)"
            className="w-28 rounded-lg border border-ds-border-subtle bg-ds-surface-raised px-3 py-2 text-sm text-ds-text-primary focus:border-ds-border-strong focus:outline-none focus:ring-2 focus:ring-ds-focus-ring/10"
          />
          <button
            onClick={handleCreate}
            className="rounded-full bg-ds-control px-4 py-2 text-sm font-medium text-ds-control-text transition hover:bg-ds-control-hover"
          >
            Create invite link
          </button>
        </div>
        <p className="text-xs text-ds-text-muted">
          Anyone with the link can join this workspace with the selected role,
          until it expires or reaches its usage limit.
        </p>
      </div>

      {links.length > 0 && (
        <ul className="flex flex-col gap-2">
          {links.map((link) => (
            <li
              key={link.id}
              className="flex flex-col gap-2 rounded-lg border border-ds-border-subtle bg-ds-surface-sunken p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 overflow-hidden">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-ds-state-selected px-2 py-0.5 text-xs font-medium text-ds-text-secondary">
                      {roleLabels[link.role]}
                    </span>
                    <span className="text-xs text-ds-text-muted">
                      Created{" "}
                      {new Date(link.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                    {link.expiresAt && (
                      <span className="text-xs text-ds-text-muted">
                        · Expires{" "}
                        {new Date(link.expiresAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    )}
                    <span className="text-xs text-ds-text-muted">
                      ·{" "}
                      {link.maxUses === null
                        ? `${link.useCount} use${link.useCount === 1 ? "" : "s"}`
                        : `${link.useCount}/${link.maxUses} used`}
                    </span>
                  </div>
                  <input
                    readOnly
                    value={getInviteUrl(link.token)}
                    onClick={(e) => {
                      e.currentTarget.select();
                      navigator.clipboard.writeText(e.currentTarget.value);
                    }}
                    className="mt-2 w-full cursor-pointer truncate rounded border border-ds-border-subtle bg-ds-surface-raised px-2 py-1 text-xs font-mono text-ds-text-secondary"
                  />
                </div>
                <button
                  onClick={() => handleRevoke(link.id)}
                  className="shrink-0 text-sm text-ds-text-secondary transition hover:text-ds-danger-text"
                  aria-label="Revoke invite link"
                >
                  Revoke
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
