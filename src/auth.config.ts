import type { NextAuthConfig } from "next-auth";

import {
  authorizeRouteAccess,
  routeProtectionPolicy,
} from "@/lib/auth/route-protection-policy";

function isJwtSessionError(error: Error): boolean {
  return (
    error.name === "JWTSessionError" ||
    (error as Error & { type?: unknown }).type === "JWTSessionError"
  );
}

/**
 * Edge-safe Auth.js configuration.
 *
 * This object is shared between the full Node-runtime config in `src/auth.ts`
 * (which adds the Credentials/Google providers plus the Prisma/bcrypt callbacks)
 * and the Edge proxy in `src/proxy.ts`. It must therefore avoid
 * importing anything that can't run on the Edge runtime (no Prisma, no bcrypt).
 */
export const authConfig = {
  session: { strategy: "jwt" },
  trustHost: true,
  pages: {
    signIn: routeProtectionPolicy.signIn,
    error: routeProtectionPolicy.signIn,
  },
  logger: {
    error(error) {
      if (isJwtSessionError(error)) return;
      console.error(error);
    },
  },
  providers: [],
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      return authorizeRouteAccess({
        isLoggedIn: Boolean(auth?.user),
        nextUrl,
      });
    },
  },
} satisfies NextAuthConfig;
