"use client";

import { useFormStatus } from "react-dom";

import { createDocument } from "./actions";

function SubmitButton({
  className,
  children,
}: {
  className: string;
  children: React.ReactNode;
}) {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending} className={className}>
      {pending ? "Creating…" : children}
    </button>
  );
}

/**
 * Submits the `createDocument` server action, showing a pending state while the
 * document is created and the redirect to its editor resolves.
 */
export function NewDocumentButton({
  className,
  children = "New document",
}: {
  className: string;
  children?: React.ReactNode;
}) {
  return (
    <form action={createDocument}>
      <SubmitButton className={className}>{children}</SubmitButton>
    </form>
  );
}
