import NextAuth from "next-auth"

declare module "next-auth" {
  interface Session {
    user: {
      userId?: string
      username?: string
      email?: string
      firstName?: string
      lastName?: string
      role?: string
      isVerified?: boolean
      phoneNumber?: string
      gender?: string
    }
    accessToken?: string
    error?: string
  }

  interface User {
    userId?: string
    username?: string
    email?: string
    firstName?: string
    lastName?: string
    role?: string
    isVerified?: boolean
    phoneNumber?: string
    gender?: string
  }

  interface JWT {
    userId?: string
    username?: string
    email?: string
    firstName?: string
    lastName?: string
    role?: string
    isVerified?: boolean
    accessToken?: string
    refreshToken?: string
    accessTokenExpires?: number
    user?: User
    error?: string
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string
    username?: string
    email?: string
    firstName?: string
    lastName?: string
    role?: string
    isVerified?: boolean
    accessToken?: string
    refreshToken?: string
    accessTokenExpires?: number
    user?: User
    error?: string
  }
}
