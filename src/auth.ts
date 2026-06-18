import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";

import { authConfig } from "@/auth.config";
import { seedSampleDocument } from "@/lib/onboarding";
import { prisma } from "@/lib/prisma";

const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        const email =
          typeof credentials?.email === "string"
            ? credentials.email.trim().toLowerCase()
            : "";
        const password =
          typeof credentials?.password === "string" ? credentials.password : "";

        if (!email || !password) {
          return null;
        }

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user?.passwordHash) {
          return null;
        }

        const passwordMatches = await bcrypt.compare(
          password,
          user.passwordHash,
        );
        if (!passwordMatches) {
          return null;
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
        };
      },
    }),
    ...(googleClientId && googleClientSecret
      ? [
          Google({
            clientId: googleClientId,
            clientSecret: googleClientSecret,
          }),
        ]
      : []),
  ],
  callbacks: {
    ...authConfig.callbacks,
    signIn({ user, account }) {
      // OAuth sign-ins must carry an email so we can create/link a local user.
      if (account?.provider === "google") {
        return Boolean(user.email);
      }
      return true;
    },
    async jwt({ token, user, account }) {
      if (account?.provider === "google" && user?.email) {
        // First Google login creates the user; a returning email links to the
        // existing account that shares the (Google-verified) email address. We
        // find-then-create/update (instead of upsert) so we can detect a
        // brand-new user and seed their first-run sample document exactly once.
        const email = user.email.toLowerCase();
        const existing = await prisma.user.findUnique({ where: { email } });
        const dbUser = existing
          ? await prisma.user.update({
              where: { email },
              data: {
                name: user.name ?? undefined,
                image: user.image ?? undefined,
              },
            })
          : await prisma.user.create({
              data: {
                email,
                name: user.name ?? null,
                image: user.image ?? null,
              },
            });
        token.id = dbUser.id;
        if (!existing) {
          await seedSampleDocument(dbUser.id);
        }
      } else if (user) {
        token.id = user.id;
      }
      return token;
    },
    session({ session, token }) {
      if (token.id && session.user) {
        session.user.id = token.id;
      }
      return session;
    },
  },
});
