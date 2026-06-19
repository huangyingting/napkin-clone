"use server";

import { cookies } from "next/headers";

import { LOCALE_COOKIE } from "@/lib/i18n/server";
import { normaliseLocale, type Locale } from "@/lib/i18n";

/**
 * Server action that persists the user's locale preference in a cookie so the
 * RSC layout can read it on the next render (via `getLocale()` in `server.ts`).
 */
export async function setLocaleCookie(locale: Locale): Promise<void> {
  const normalised = normaliseLocale(locale);
  const cookieStore = await cookies();
  cookieStore.set(LOCALE_COOKIE, normalised, {
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
    sameSite: "lax",
    httpOnly: false, // must be readable client-side for optimistic updates
  });
}
