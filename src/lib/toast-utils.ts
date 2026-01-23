import { toast } from 'sonner'

export const showToast = (
    type: 'success' | 'error' | 'info',
    message: string
) => {
    switch (type) {
        case 'success':
            toast.success(message, { duration: 2000, icon: '✓' })
            break
        case 'error':
            toast.error(message, { duration: 4000, icon: '✕' })
            break
        case 'info':
            toast.info(message, { duration: 3000 })
            break
    }
}
