/**
 * Stable brand-token facade.
 *
 * R39 keeps the public import path while moving BrandStyle → deck token mapping
 * into the dedicated brand-presentation-theme-adapter boundary.
 */

export {
  brandToTokenSet,
  brandToMasterChrome,
  applyBrandToDeck,
} from "./brand-presentation-theme-adapter";
