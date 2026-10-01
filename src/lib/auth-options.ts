import type { NextAuthOptions } from "next-auth";
import type { OAuthConfig } from "next-auth/providers/oauth";
import GoogleProvider from "next-auth/providers/google";

import { User } from "../../models/User";
import { connectToMongo } from "@/lib/mongodb";
import {
  emailMatchesTenantAllowlist,
  getTenantEmailAllowlist,
  resolveOAuthSignInEmail,
} from "@/lib/auth-tenant";

/**
 * Space-separated scopes for LinkedIn OAuth authorize URL.
 * Default is the narrowest OIDC scope. Add profile / email only if your LinkedIn
 * app allows them (Developer Portal → Products → OpenID Connect).
 */
const linkedInScope = process.env.LINKEDIN_SCOPE?.trim() || "openid";

type LinkedInOIDCProfile = {
  sub: string;
  name?: string;
  email?: string;
  picture?: string;
};

/**
 * Explicit LinkedIn OIDC provider (no `LinkedInProvider()` merge).
 * Use the app product **Sign In with LinkedIn using OpenID Connect** in LinkedIn Developers.
 */
function linkedIn(): OAuthConfig<LinkedInOIDCProfile> {
  return {
    id: "linkedin",
    name: "LinkedIn",
    type: "oauth",
    wellKnown:
      "https://www.linkedin.com/oauth/.well-known/openid-configuration",
    authorization: {
      params: {
        response_type: "code",
        scope: linkedInScope,
      },
    },
    clientId: process.env.LINKEDIN_CLIENT_ID ?? "",
    clientSecret: process.env.LINKEDIN_CLIENT_SECRET ?? "",
    client: {
      token_endpoint_auth_method: "client_secret_post",
    },
    userinfo: {
      url: "https://api.linkedin.com/v2/userinfo",
    },
    profile(profile) {
      return {
        id: profile.sub,
        name: profile.name,
        email: profile.email,
        image: profile.picture,
      };
    },
    style: {
      logo: "/linkedin.svg",
      bg: "#069",
      text: "#fff",
    },
  };
}

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers: [
    linkedIn(),
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),
  ],
  callbacks: {
    async signIn({ user, profile }) {
      const domains = getTenantEmailAllowlist();
      if (domains.length === 0) return true;

      const email = resolveOAuthSignInEmail(user, profile);
      if (!email) {
        console.warn(
          "[auth] Tenant allowlist is active but the provider did not return an email; denying sign-in. For LinkedIn, set LINKEDIN_SCOPE to include email when possible."
        );
        return false;
      }
      if (!emailMatchesTenantAllowlist(email, domains)) {
        console.warn(
          `[auth] Sign-in denied: email domain is not in the allowlist (${domains.join(", ")}).`
        );
        return false;
      }
      return true;
    },
    async jwt({ token, account, profile, user }) {
      if (account && user?.id) {
        try {
          await connectToMongo();

          const p = profile as {
            sub?: string;
            email?: string;
            name?: string;
            picture?: string;
          };

          if (account.provider === "linkedin") {
            const doc = await User.findOneAndUpdate(
              { linkedin_sub: user.id },
              {
                $set: {
                  email: (user.email ?? "").trim(),
                  name: (user.name ?? "").trim(),
                  image: (user.image ?? "").trim(),
                  auth_provider: "linkedin",
                  last_login_at: new Date(),
                },
                $setOnInsert: {
                  linkedin_sub: user.id,
                  google_sub: "",
                  created_at: new Date(),
                },
              },
              { upsert: true, returnDocument: "after" }
            );
            token.mongoUserId = String(doc._id);
            token.linkedinId = user.id;
          } else if (account.provider === "google") {
            const googleSub = p.sub ?? user.id;
            const email = (user.email ?? "").trim();
            // Try to link to an existing account by email first, then by google_sub
            const doc = await User.findOneAndUpdate(
              { $or: [{ google_sub: googleSub }, ...(email ? [{ email }] : [])] },
              {
                $set: {
                  email,
                  name: (user.name ?? "").trim(),
                  image: (user.image ?? p.picture ?? "").trim(),
                  google_sub: googleSub,
                  auth_provider: "google",
                  last_login_at: new Date(),
                },
                $setOnInsert: {
                  linkedin_sub: "",
                  created_at: new Date(),
                },
              },
              { upsert: true, returnDocument: "after" }
            );
            token.mongoUserId = String(doc._id);
            token.googleId = googleSub;
          }
        } catch (e) {
          console.error("[auth] Failed to persist user to MongoDB:", e);
        }
      }

      if (account && profile) {
        const p = profile as {
          sub?: string;
          email?: string;
          name?: string;
          picture?: string;
        };
        if (p.email) token.email = p.email;
        if (p.name) token.name = p.name;
        if (p.picture) token.picture = p.picture;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.linkedinId =
          typeof token.linkedinId === "string" ? token.linkedinId : undefined;
        session.user.googleId =
          typeof token.googleId === "string" ? token.googleId : undefined;
        if (typeof token.email === "string") session.user.email = token.email;
        if (typeof token.name === "string") session.user.name = token.name;
        if (typeof token.picture === "string") session.user.image = token.picture;
        if (typeof token.mongoUserId === "string")
          session.user.mongoUserId = token.mongoUserId;
      }
      return session;
    },
  },
};
