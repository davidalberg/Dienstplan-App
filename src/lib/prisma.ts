import { PrismaClient } from '@prisma/client'

const prismaClientSingleton = () => {
    return new PrismaClient({
        // Connection pool settings for Supabase
        datasources: {
            db: {
                url: process.env.DATABASE_URL
            }
        },
        // Log slow queries in development
        log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error']
    })
}

declare global {
    var prisma: undefined | ReturnType<typeof prismaClientSingleton>
}

const prisma = globalThis.prisma ?? prismaClientSingleton()

export default prisma

if (process.env.NODE_ENV !== 'production') globalThis.prisma = prisma
