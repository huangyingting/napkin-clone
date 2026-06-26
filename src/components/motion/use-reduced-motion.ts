"use client";

/**
 * Single re-export point for the reduced-motion hook used across the app.
 *
 * Importing from here rather than directly from `framer-motion` lets us
 * swap the underlying implementation (e.g., to a CSS-media-query hook) in
 * one place without touching every consumer.
 */
export { useReducedMotion } from "framer-motion";
