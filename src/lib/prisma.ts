import { PrismaClient } from '@prisma/client'

const prismaClientSingleton = () => {
    // WICHTIG: Für Vercel Serverless Functions muss Supabase im Transaction Mode verwendet werden
    // DATABASE_URL sollte Port 6543 verwenden (nicht 5432) und pgbouncer=true Parameter haben
    // Beispiel: postgresql://user:pass@host:6543/db?pgbouncer=true&connection_limit=1

    const databaseUrl = process.env.DATABASE_URL

    // Füge Connection Pool Parameter hinzu, falls nicht vorhanden
    // WICHTIG: connection_limit=1 für Serverless (jede Lambda hat eigenen Prisma Client)
    let optimizedUrl = databaseUrl || ''
    if (optimizedUrl && !optimizedUrl.includes('pgbouncer=true')) {
        const separator = optimizedUrl.includes('?') ? '&' : '?'
        optimizedUrl += `${separator}pgbouncer=true&connection_limit=1&pool_timeout=10`
    }
    // Falls connection_limit bereits gesetzt, auf 1 reduzieren
    optimizedUrl = optimizedUrl.replace(/connection_limit=\d+/, 'connection_limit=1')

    return new PrismaClient({
        datasources: {
            db: {
                url: optimizedUrl
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
