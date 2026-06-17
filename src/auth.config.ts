import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe Auth.js configuration.
 *
 * This object is shared between the full Node-runtime config in `src/auth.ts`
 * (which adds the Credentials/Google providers plus the Prisma/bcrypt callbacks)
 * and the Edge middleware in `src/middleware.ts`. It must therefore avoid
 * importing anything that can't run on the Edge runtime (no Prisma, no bcrypt).
 */
export const authConfig = {
  session: { strategy: "jwt" },
  trustHost: true,
  pages: {
    signIn: "/login",
  },
  providers: [],
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = Boolean(auth?.user);
      const { pathname } = nextUrl;
      const isOnProtectedArea = pathname.startsWith("/app");
      const isOnAuthPage = pathname === "/login" || pathname === "/signup";

      if (isOnProtectedArea) {
        // Returning `false` redirects unauthenticated users to `pages.signIn`
        // (with a `callbackUrl` back to the requested page).
        return isLoggedIn;
      }

      if (isOnAuthPage && isLoggedIn) {
        return Response.redirect(new URL("/app", nextUrl));
      }

      return true;
    },
  },
} satisfies NextAuthConfig;
