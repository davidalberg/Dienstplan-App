import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import prisma from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { UserRole } from "@/types"

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

                const user = await prisma.user.findUnique({
                    where: { email: credentials.email as string },
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
