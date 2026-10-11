import { Card, PageHeader } from "@/components/ui";
import { Icon } from "@/lib/icons";
import { getSocialAccounts, type SocialAccount } from "@/lib/seed";
import { IS_DP } from "@/lib/brand";

export function SocialView({ accounts }: { accounts: SocialAccount[] }) {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Brand"
        title="Social Media"
        subtitle="Followers, growth, and top posts per account. Not connected to a social API yet."
      />

      {/* Honest state: there is no social-platform integration, so we do not
          show follower/growth numbers that would imply live tracking. */}
      <div className="flex items-center gap-2 rounded-control border border-warn/40 bg-warn-soft px-3 py-2 text-xs font-medium text-warn">
        <Icon name="share2" size={14} />
        No social platform is connected. Follower and growth figures are not tracked here yet: connect an Instagram / YouTube API or capture them manually in a later phase.
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {accounts.map((a) => (
          <Card key={a.id} className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-fg">{a.handle}</div>
                <div className="text-xs text-fg-muted">{a.platform}</div>
              </div>
              <span className="text-fg-muted">
                <Icon name="share2" size={18} />
              </span>
            </div>
            <div className="flex items-center gap-2 border-t border-border-soft pt-3">
              <span className="inline-flex items-center rounded-pill bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-fg-muted">
                Not connected
              </span>
              <span className="text-xs text-fg-muted">Metrics appear once this account is linked</span>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function SocialScreen() {
  // DP's seed social accounts (@dpperformance) are DP-only fixtures. A rebranded
  // deploy shows the honest "no account connected" empty state instead.
  return <SocialView accounts={IS_DP ? getSocialAccounts() : []} />;
}
