"use client";

/**
 * React hook that fetches the current user's plan entitlements from
 * /api/user/entitlements and returns them.
 *
 * Defaults to free-tier limits while loading or on error, so the UI is always
 * safe to render before the fetch resolves (free users are never accidentally
 * promoted).
 */

import { useEffect, useState } from "react";

import {
  getEntitlements,
  type PlanEntitlements,
} from "@/lib/billing/entitlements";

const FREE_ENTITLEMENTS: PlanEntitlements = getEntitlements("free");

export function useUserEntitlements(): PlanEntitlements {
  const [entitlements, setEntitlements] =
    useState<PlanEntitlements>(FREE_ENTITLEMENTS);

  useEffect(() => {
    fetch("/api/user/entitlements")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { entitlements?: PlanEntitlements } | null) => {
        if (data?.entitlements) {
          setEntitlements(data.entitlements);
        }
      })
      .catch(() => {
        // Keep free-tier default on network / auth error.
      });
  }, []);

  return entitlements;
}
