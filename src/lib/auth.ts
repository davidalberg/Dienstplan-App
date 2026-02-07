import NextAuth, { CredentialsSignin } from "next-auth"
import Credentials from "next-auth/providers/credentials"
import prisma from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { UserRole } from "@/types"
import { checkRateLimit } from "@/lib/rate-limiter"

// Login rate limit: 5 attempts per 15 minutes per email address
const LOGIN_RATE_LIMIT = 5
const LOGIN_RATE_WINDOW_MS = 15 * 60 * 1000 // 15 minutes

class RateLimitError extends CredentialsSignin {
    code = "rate_limit"
}

// Validate AUTH_SECRET at startup
if (!process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 32) {
    throw new Error("AUTH_SECRET must be set and at least 32 characters long")
}

// Extend NextAuth types
declare module "next-auth" {
    interface User {
        role: UserRole
        teamId?: string
    }
    interface Session {
        user: {
            id: string
            email: string
            name: string
            role: UserRole
            teamId?: string
        }
    }
}

declare module "@auth/core/jwt" {
    interface JWT {
        id: string
        role: UserRole
        teamId?: string
    }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
    session: {
        strategy: "jwt",
        maxAge: 8 * 60 * 60, // 8 hours - sessions expire after this time
        updateAge: 24 * 60 * 60 // Update session token every 24 hours
    },
    providers: [
        Credentials({
            credentials: {
                email: { label: "Email", type: "email" },
                password: { label: "Password", type: "password" }
            },
            async authorize(credentials) {
                if (!credentials?.email || !credentials?.password) return null

                const email = (credentials.email as string).toLowerCase().trim()

                // Rate limit check BEFORE any database or bcrypt operations
                const { limited } = checkRateLimit(
                    `login:${email}`,
                    LOGIN_RATE_LIMIT,
                    LOGIN_RATE_WINDOW_MS
                )

                if (limited) {
                    console.warn(
                        `[Auth] Login rate limit exceeded for email: ${email}`
                    )
                    throw new RateLimitError()
                }

                const user = await prisma.user.findUnique({
                    where: { email },
                    select: {
                        id: true,
                        email: true,
                        name: true,
                        role: true,
                        teamId: true,
                        password: true
                    }
                })

                if (!user || !user.password) return null

                const isValid = await bcrypt.compare(credentials.password as string, user.password)

                if (!isValid) return null

                return {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    role: user.role as UserRole,
                    teamId: user.teamId || undefined
                }
            }
        }),
    ],
    callbacks: {
        async jwt({ token, user }) {
            if (user) {
                token.role = user.role as UserRole
                token.id = user.id as string
                token.teamId = user.teamId
            }
            return token
        },
        async session({ session, token }) {
            if (token && session.user) {
                session.user.role = token.role
                session.user.id = token.id
                session.user.teamId = token.teamId
            }
            return session
        },
    },
    pages: {
        signIn: "/login",
    }
})
