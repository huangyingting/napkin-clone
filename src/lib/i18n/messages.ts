/**
 * Message catalog for the TextIQ UI.
 *
 * Structure: flat key → string (or a function for interpolation).
 * Add new keys to `en` first, then translate to each additional locale.
 * Missing keys in non-default locales fall back to the `en` value.
 */

export const SUPPORTED_LOCALES = ["en", "es"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

export type Messages = {
  // ── Site header ───────────────────────────────────────────────────────────
  "header.brand": string;
  "header.nav.documents": string;
  "header.nav.workspaces": string;
  "header.nav.brands": string;
  "header.nav.login": string;
  "header.nav.signup": string;

  // ── Dashboard ─────────────────────────────────────────────────────────────
  "dashboard.title": string;
  "dashboard.subtitle": (email: string) => string;
  "dashboard.action.newDocument": string;
  "dashboard.action.import": string;
  "dashboard.action.importing": string;

  // ── Template picker ───────────────────────────────────────────────────────
  "templatePicker.title": string;
  "templatePicker.subtitle": string;
  "templatePicker.cancel": string;
  "templatePicker.creating": string;
  "templatePicker.close": string;

  // ── Language switcher ─────────────────────────────────────────────────────
  "languageSwitcher.label": string;
};

const en: Messages = {
  "header.brand": "TextIQ",
  "header.nav.documents": "Documents",
  "header.nav.workspaces": "Workspaces",
  "header.nav.brands": "Brands",
  "header.nav.login": "Log in",
  "header.nav.signup": "Sign up",

  "dashboard.title": "Your documents",
  "dashboard.subtitle": (email) => `Signed in as ${email}`,
  "dashboard.action.newDocument": "New document",
  "dashboard.action.import": "Import",
  "dashboard.action.importing": "Importing…",

  "templatePicker.title": "Start a new document",
  "templatePicker.subtitle": "Pick a template or start blank.",
  "templatePicker.cancel": "Cancel",
  "templatePicker.creating": "Creating…",
  "templatePicker.close": "Close",

  "languageSwitcher.label": "Language",
};

const es: Messages = {
  "header.brand": "TextIQ",
  "header.nav.documents": "Documentos",
  "header.nav.workspaces": "Espacios de trabajo",
  "header.nav.brands": "Marcas",
  "header.nav.login": "Iniciar sesión",
  "header.nav.signup": "Registrarse",

  "dashboard.title": "Tus documentos",
  "dashboard.subtitle": (email) => `Sesión iniciada como ${email}`,
  "dashboard.action.newDocument": "Nuevo documento",
  "dashboard.action.import": "Importar",
  "dashboard.action.importing": "Importando…",

  "templatePicker.title": "Crear nuevo documento",
  "templatePicker.subtitle": "Elige una plantilla o empieza en blanco.",
  "templatePicker.cancel": "Cancelar",
  "templatePicker.creating": "Creando…",
  "templatePicker.close": "Cerrar",

  "languageSwitcher.label": "Idioma",
};

export const catalog: Record<Locale, Messages> = { en, es };
