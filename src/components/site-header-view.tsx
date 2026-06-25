import Link from "next/link";

import {
  MobileNavMenu,
  MobileNavNonClosing,
} from "@/components/mobile-nav-menu";
import { ShellNavLinks } from "@/components/shell-nav-links";
import {
  ShellCreditsSlot,
  ShellKeyboardShortcutsSlot,
  ShellLanguageSwitcherSlot,
  ShellUserMenuSlot,
} from "@/components/shell-utility-slots";
import type { AppShellViewModel } from "@/lib/app-shell/view-model";

export function SiteHeaderView({
  viewModel,
}: {
  viewModel: AppShellViewModel;
}) {
  const {
    auth,
    brandLabel,
    displayIdentity,
    enabledUtilities,
    navItems,
    planCreditSummary,
  } = viewModel;

  return (
    <header className="relative z-header flex w-full items-center justify-between overflow-x-clip border-b border-ds-border-strong bg-ds-surface-base/80 px-4 py-3 backdrop-blur sm:px-6">
      <Link
        href="/"
        className="shrink-0 text-base font-semibold tracking-tight text-ds-text-primary"
      >
        {brandLabel}
      </Link>

      <nav className="hidden items-center gap-3 md:flex">
        {auth.isAuthenticated ? (
          <>
            <ShellNavLinks items={navItems} variant="desktop" />
            <ShellCreditsSlot
              enabled={enabledUtilities.credits}
              summary={planCreditSummary}
              variant="desktop"
            />
            <ShellKeyboardShortcutsSlot
              enabled={enabledUtilities.keyboardShortcuts}
            />
            <ShellLanguageSwitcherSlot
              enabled={enabledUtilities.languageSwitcher}
            />
            <ShellUserMenuSlot
              enabled={enabledUtilities.userMenu}
              identity={displayIdentity}
            />
          </>
        ) : (
          <>
            <ShellLanguageSwitcherSlot
              enabled={enabledUtilities.languageSwitcher}
            />
            <ShellNavLinks items={navItems} variant="desktop" />
          </>
        )}
      </nav>

      <div className="flex items-center gap-1 md:hidden">
        {auth.isAuthenticated ? (
          <>
            <ShellUserMenuSlot
              enabled={enabledUtilities.userMenu}
              identity={displayIdentity}
            />

            <MobileNavMenu>
              <ShellNavLinks items={navItems} variant="mobileDrawer" />
              <ShellCreditsSlot
                enabled={enabledUtilities.credits}
                summary={planCreditSummary}
                variant="mobileDrawer"
              />

              <div className="my-2 border-t border-ds-border-strong" />

              <MobileNavNonClosing className="flex flex-col gap-0.5">
                <ShellLanguageSwitcherSlot
                  enabled={enabledUtilities.languageSwitcher}
                />
                <ShellKeyboardShortcutsSlot
                  enabled={enabledUtilities.keyboardShortcuts}
                />
              </MobileNavNonClosing>
            </MobileNavMenu>
          </>
        ) : (
          <>
            <ShellLanguageSwitcherSlot
              enabled={enabledUtilities.languageSwitcher}
            />
            <ShellNavLinks items={navItems} variant="mobileInline" />
          </>
        )}
      </div>
    </header>
  );
}
