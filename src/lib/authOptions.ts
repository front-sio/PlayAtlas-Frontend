import type { NextAuthOptions } from "next-auth";
import { authApi } from "@/lib/apiService";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "") || "http://localhost:8080/api";

const TOKEN_REFRESH_BUFFER_MS = 60 * 1000;

const decodeJwtExp = (token: string) => {
  try {
    const payload = token.split(".")[1];
    const decodeBase64 =
      typeof globalThis.atob === "function"
        ? globalThis.atob
        : (value: string) => {
            const buffer = (globalThis as any).Buffer;
            if (!buffer) return "";
            return buffer.from(value, "base64").toString("utf-8");
          };
    const decoded = JSON.parse(decodeBase64(payload));
    return typeof decoded.exp === "number" ? decoded.exp * 1000 : null;
  } catch {
    return null;
  }
};

const refreshAccessToken = async (refreshToken: string) => {
  try {
    const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ refreshToken }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.success || !data?.data?.accessToken) return null;
    const newAccessToken = data.data.accessToken as string;
    const newRefreshToken = (data.data.refreshToken as string | undefined) || refreshToken;
    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      accessTokenExpires: decodeJwtExp(newAccessToken) ?? Date.now() + 15 * 60 * 1000,
    };
  } catch {
    return null;
  }
};

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  debug: true,
  providers: [
    {
      id: "credentials",
      name: "credentials",
      type: "credentials",
      credentials: {
        identifier: { label: "Email, Username or Phone", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.identifier || !credentials?.password) {
          console.log("❌ Missing credentials in authorize");
          return null;
        }

        try {
          const result = await authApi.login({
            identifier: credentials.identifier as string,
            password: credentials.password as string,
          });

          if (result.success) {
            return {
              ...result.data.user,
              accessToken: result.data.accessToken,
              refreshToken: result.data.refreshToken,
            } as any;
          }

          if (result.error?.includes("Account not verified")) {
            throw new Error("ACCOUNT_NOT_VERIFIED");
          }

          return null;
        } catch (error: any) {
          const payload = error?.data;
          if (payload?.requiresVerification) {
            const userId = payload.userId || "";
            const channel = payload.verificationChannel || "email";
            throw new Error(`ACCOUNT_NOT_VERIFIED:${userId}:${channel}`);
          }
          if (error.message === "ACCOUNT_NOT_VERIFIED") {
            throw new Error("ACCOUNT_NOT_VERIFIED");
          }
          return null;
        }
      },
    } as any,
  ],
  pages: {
    signIn: "/auth/login",
    error: "/auth/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 24 * 60 * 60,
  },
  callbacks: {
    async jwt({ token, user, account }) {
      if (user && account) {
        const userObj = user as any;
        token.accessToken = userObj.accessToken;
        token.refreshToken = userObj.refreshToken;
        token.accessTokenExpires =
          decodeJwtExp(userObj.accessToken) ?? Date.now() + 15 * 60 * 1000;
        token.userId = userObj.userId;
        token.username = userObj.username;
        token.email = userObj.email;
        token.firstName = userObj.firstName;
        token.lastName = userObj.lastName;
        token.role = userObj.role;
        token.isVerified = userObj.isVerified;
        token.phoneNumber = userObj.phoneNumber;
        token.gender = userObj.gender;
      }

      const accessToken = token.accessToken as string | undefined;
      const refreshToken = token.refreshToken as string | undefined;
      const accessTokenExpires = token.accessTokenExpires as number | undefined;

      if (!accessToken || !refreshToken || !accessTokenExpires) return token;
      if (Date.now() < accessTokenExpires - TOKEN_REFRESH_BUFFER_MS) return token;

      const refreshed = await refreshAccessToken(refreshToken);
      if (!refreshed) {
        token.error = "RefreshAccessTokenError";
        return token;
      }

      token.accessToken = refreshed.accessToken;
      token.refreshToken = refreshed.refreshToken;
      token.accessTokenExpires = refreshed.accessTokenExpires;
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.userId = token.userId as string;
        session.user.username = token.username as string;
        session.user.email = token.email as string;
        session.user.firstName = token.firstName as string;
        session.user.lastName = token.lastName as string;
        session.user.role = token.role as string;
        session.user.isVerified = token.isVerified as boolean;
        session.user.phoneNumber = token.phoneNumber as string;
        session.user.gender = token.gender as string;
        (session as any).accessToken = token.accessToken as string;
        (session as any).error = token.error as string | undefined;
      }
      return session;
    },
    async redirect({ url, baseUrl }) {
      // Avoid redirect loops back into auth pages after login
      try {
        const target = new URL(url, baseUrl);
        if (target.pathname.startsWith("/auth")) return `${baseUrl}/dashboard`;
      } catch {
        // ignore
      }

      // Prefer relative redirects within this site
      if (url.startsWith("/")) return `${baseUrl}${url}`;
      if (url.startsWith(baseUrl)) return url;
      return `${baseUrl}/dashboard`;
    },
  },
};
