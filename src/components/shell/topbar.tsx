"use client";

import Link from "next/link";
import { Icon } from "@/lib/icons";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { BRAND } from "@/lib/brand";
import { DevRoleSwitcher } from "@/components/shell/dev-role-switcher";
import { CoachPreviewPicker } from "@/components/shell/coach-preview-picker";
import { DemoBadge } from "@/components/shell/demo-badge";
import { CommandPalette } from "@/components/shell/command-palette";
import { MobileNav } from "@/components/shell/mobile-nav";
import { NotificationsBell } from "@/components/shell/notifications-bell";
import type { HqNotification } from "@/lib/data";

export function Topbar({
  coaches = [],
  notifications = [],
  addClientUrl,
}: {
  coaches?: { id: string; name: string }[];
  /** Role-scoped bell items, computed server-side in the HQ layout. */
  notifications?: HqNotification[];
  /** GHL contacts URL (clients are created in the CRM, the source of truth). */
  addClientUrl?: string;
}) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border bg-surface px-6">
      {/* Mobile nav + Cmd+K search + demo-data indicator */}
      <div className="flex items-center gap-3">
        <MobileNav />
        <CommandPalette />
        <DemoBadge />
      </div>

      <div className="flex items-center gap-2">
        <DevRoleSwitcher />
        <CoachPreviewPicker coaches={coaches} />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => window.open("https://www.loom.com/record", "_blank", "noopener")}
          title="Opens Loom's recorder in a new tab"
        >
          <Icon name="video" size={15} />
          Record Loom
        </Button>
        {addClientUrl ? (
          <Button
            size="sm"
            onClick={() => window.open(addClientUrl, "_blank", "noopener")}
            title="Clients are created in GoHighLevel (the CRM source of truth); the HQ syncs them in"
          >
            <Icon name="plus" size={15} />
            Add client
          </Button>
        ) : null}
        <Link
          href="/inbox"
          aria-label="Inbox"
          className="flex h-8 w-8 items-center justify-center rounded-control border border-border bg-surface text-fg-dim transition-colors hover:text-fg"
        >
          <Icon name="message" size={16} />
        </Link>
        <NotificationsBell items={notifications} />
        <Avatar name={`${BRAND.name} Owner`} size="md" />
      </div>
    </header>
  );
}
