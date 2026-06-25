import NextAuth from "next-auth";

import { authConfig } from "@/auth.config";
import { routeProtectionPolicy } from "@/lib/auth/route-protection-policy";

// Next.js 16 "proxy" convention (formerly "middleware"): runs on every matched
// request and performs the optimistic auth check defined by
// `authConfig.callbacks.authorized` (guarding `/app/*` and bouncing logged-in
// users off `/login` and `/signup`). It uses the lightweight, provider-free
// `authConfig` so the proxy never bundles Prisma/bcrypt.
const { auth } = NextAuth(authConfig);

export const proxy = auth;

export const config = {
  matcher: routeProtectionPolicy.proxy.matcher,
};
