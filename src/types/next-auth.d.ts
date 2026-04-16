import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      linkedinId?: string;
      /** MongoDB `Users` document id (hex string). */
      mongoUserId?: string;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    linkedinId?: string;
    mongoUserId?: string;
  }
}
