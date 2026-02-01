import { useEffect, useCallback } from 'react'

export interface KeyboardShortcutHandlers {
  onNewShift?: () => void
  onEscape?: () => void
  onSave?: () => void
  onPrevMonth?: () => void
  onNextMonth?: () => void
  onListView?: () => void
  onCalendarView?: () => void
  onHelp?: () => void
}

/**
 * Custom hook for keyboard shortcuts
 * Only active when no input/textarea is focused
 */
export function useKeyboardShortcuts(handlers: KeyboardShortcutHandlers, enabled: boolean = true) {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Don't trigger shortcuts when typing in inputs
    const target = e.target as HTMLElement
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      return
    }

    // Check for modifiers (only ctrl+s should have modifiers)
    const hasModifier = e.ctrlKey || e.metaKey || e.altKey

    // Ctrl+S - Save
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault()
      handlers.onSave?.()
      return
    }

    // No other shortcuts should work with modifiers
    if (hasModifier) return

    switch (e.key.toLowerCase()) {
      case 'n':
        e.preventDefault()
        handlers.onNewShift?.()
        break
      case 'escape':
        e.preventDefault()
        handlers.onEscape?.()
        break
      case 'arrowleft':
        e.preventDefault()
        handlers.onPrevMonth?.()
        break
      case 'arrowright':
        e.preventDefault()
        handlers.onNextMonth?.()
        break
      case 'l':
        e.preventDefault()
        handlers.onListView?.()
        break
      case 'c':
        e.preventDefault()
        handlers.onCalendarView?.()
        break
      case '?':
        e.preventDefault()
        handlers.onHelp?.()
        break
    }
  }, [handlers])

  useEffect(() => {
    if (!enabled) return

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [enabled, handleKeyDown])
}
