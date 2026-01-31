"use client"

import { SessionProvider } from "next-auth/react"
import { SWRConfig } from 'swr'
import { Toaster } from 'sonner'

export function Providers({ children }: { children: React.ReactNode }) {
    return (
        <SessionProvider refetchOnWindowFocus={false}>
            <SWRConfig
                value={{
                    // ✅ PERFORMANCE FIX: Global SWR config for optimal caching
                    revalidateOnFocus: false,       // Don't refetch on window focus
                    revalidateOnReconnect: true,   // Refetch on reconnect (good for offline)
                    dedupingInterval: 30000,        // 30s deduping for instant navigation
                    revalidateIfStale: true,        // Use cache first, revalidate in background
                    shouldRetryOnError: true,       // Retry failed requests
                    errorRetryCount: 3,             // Max 3 retries
                    errorRetryInterval: 5000,       // 5s between retries
                    focusThrottleInterval: 60000,   // Throttle focus revalidation to 60s
                }}
            >
                {children}
                <Toaster
                    position="top-center"
                    toastOptions={{
                        duration: 3000,
                        style: {
                            background: 'white',
                            color: 'black',
                            border: '1px solid #e5e7eb',
                        },
                    }}
                />
            </SWRConfig>
        </SessionProvider>
    )
}
