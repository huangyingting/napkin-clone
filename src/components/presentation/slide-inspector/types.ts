import type { CSSProperties } from "react";

import type { SlideAssetActionPort } from "@/lib/action-ports";
import type { Deck, Slide } from "@/lib/presentation/deck";
import type { ElementPatch } from "@/lib/presentation/deck-mutations";
import type {
  AlignMode,
  DistributeMode,
  MatchSizeMode,
} from "@/lib/presentation/element-align";
import type { ArrangeMode } from "@/lib/presentation/element-arrange";
import type { RightPanelTab } from "@/lib/presentation/slide-panel-ui";
import type { StaleReason } from "@/lib/presentation/source-link-staleness";
import type { PresentationRole } from "@/lib/presentation/presentation-theme";
import type { Visual } from "@/lib/visual/schema";

export type AddElementKind = PresentationRole | "image" | "shape";

export interface SlideInspectorProps {
  slide: Slide;
  slideIndex: number;
  deck: Deck;
  visuals: ReadonlyMap<string, Visual>;
  selectedElementId: string | null;
  onSelectElement: (id: string | null) => void;
  canDelete: boolean;
  onDuplicateSlide: () => void;
  onRemoveSlide: () => void;
  onUpdateNotes: (value: string, coalesceKey?: string) => void;
  onUpdateElement: (
    id: string,
    patch: ElementPatch,
    coalesceKey?: string,
  ) => void;
  onRemoveElement: (id: string) => void;
  onDuplicateElement: (id: string) => void;
  onBringToFront: (id: string) => void;
  onSendToBack: (id: string) => void;
  selectedElementIds?: ReadonlySet<string>;
  onAlign?: (ids: string[], mode: AlignMode) => void;
  onDistribute?: (ids: string[], mode: DistributeMode) => void;
  onMatchSize?: (ids: string[], mode: MatchSizeMode) => void;
  onArrange?: (ids: string[], mode: ArrangeMode) => void;
  onGroupElements?: (ids: string[]) => void;
  onUngroupElements?: (groupId: string) => void;
  onSetElementHidden?: (elementId: string, hidden: boolean) => void;
  onSetElementLocked?: (elementId: string, locked: boolean) => void;
  onMoveElementZOrder?: (elementId: string, direction: "up" | "down") => void;
  onRenameElement?: (elementId: string, name: string) => void;
  onReorderElement?: (elementId: string, targetElementId: string) => void;
  sourceStaleReasonById?: ReadonlyMap<string, StaleReason>;
  onUpdateElementFromSource?: (elementId: string) => void;
  onUnlinkElementSource?: (elementId: string) => void;
  onRelinkElementSource?: (elementId: string) => void;
  onBackgroundChange: (color: string | undefined) => void;
  onBackgroundGradientChange: (
    gradient: { from: string; to: string; angle?: number } | undefined,
  ) => void;
  onBackgroundImageChange: (image: string | undefined) => void;
  onBackgroundAssetChange?: (
    opts: { url: string; assetId: string } | undefined,
  ) => void;
  onAccentChange: (color: string | undefined) => void;
  brandSwatches?: readonly string[];
  className?: string;
  style?: CSSProperties;
  showAdvanced?: boolean;
  documentId?: string;
  slideAssetPort?: SlideAssetActionPort;
  onClose?: () => void;
  /** The active panel to render. The router shows exactly one panel. */
  initialTab?: RightPanelTab;
  /** Switch the active panel from the in-panel switcher. */
  onSelectTab?: (tab: RightPanelTab) => void;
}
