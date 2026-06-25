import { SiteHeaderView } from "@/components/site-header-view";
import { loadAppShellViewModel } from "@/lib/app-shell/loader";

export async function SiteHeader() {
  const viewModel = await loadAppShellViewModel();

  return <SiteHeaderView viewModel={viewModel} />;
}
