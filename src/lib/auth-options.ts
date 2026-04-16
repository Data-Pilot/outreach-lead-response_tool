import type { NextAuthOptions } from "next-auth";
import type { OAuthConfig } from "next-auth/providers/oauth";

import { User } from "../../models/User";
import { connectToMongo } from "@/lib/mongodb";

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
  },
  providers: [linkedIn()],
  callbacks: {
    async jwt({ token, account, profile, user }) {
      if (account?.provider === "linkedin" && user?.id) {
        try {
          await connectToMongo();
          const doc = await User.findOneAndUpdate(
            { linkedin_sub: user.id },
            {
              $set: {
                email: (user.email ?? "").trim(),
                name: (user.name ?? "").trim(),
                image: (user.image ?? "").trim(),
                last_login_at: new Date(),
              },
              $setOnInsert: {
                linkedin_sub: user.id,
                created_at: new Date(),
              },
            },
            { upsert: true, new: true }
          );
          token.mongoUserId = String(doc._id);
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
        if (p.sub) token.linkedinId = p.sub;
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
