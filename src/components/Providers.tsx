"use client"

import { SessionProvider } from "next-auth/react"
import { Toaster } from 'sonner'

export function Providers({ children }: { children: React.ReactNode }) {
    return (
        <SessionProvider refetchOnWindowFocus={false}>
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
        </SessionProvider>
    )
}
