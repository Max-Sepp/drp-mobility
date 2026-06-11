import { createContext, useCallback, useContext, useRef } from 'react'
import type React from 'react'

type SheetCallbacks = { open: () => void; close: () => void }

type SheetStackContextValue = {
  /** Register a sheet's open/close callbacks. Returns an unregister cleanup function. */
  register: (id: string, open: () => void, close: () => void) => () => void
  /** Open a sheet. Hides the current top of the stack first (it will re-appear when this one closes). */
  push: (id: string) => void
  /**
   * Call from a sheet's onChange(-1). Returns true if the sheet was closed by the user, so the
   * caller should clean up its own state. Returns false if it was hidden by a push() call — the
   * sheet is just temporarily out of view and its state should be left alone.
   */
  onClosed: (id: string) => boolean
  /** Close every sheet in the stack immediately, without re-opening anything. */
  dismissAll: () => void
}

const SheetStackContext = createContext<SheetStackContextValue | null>(null)

export function SheetStackProvider({ children }: { children: React.ReactNode }) {
  const registry = useRef(new Map<string, SheetCallbacks>())
  const stack = useRef<string[]>([])
  // IDs that were hidden by a push() call — their onChange(-1) should be ignored.
  const hiddenByStack = useRef(new Set<string>())

  const register = useCallback((id: string, open: () => void, close: () => void) => {
    registry.current.set(id, { open, close })
    return () => {
      registry.current.delete(id)
      stack.current = stack.current.filter((s) => s !== id)
      hiddenByStack.current.delete(id)
    }
  }, [])

  const push = useCallback((id: string) => {
    const top = stack.current[stack.current.length - 1]
    if (top && top !== id) {
      hiddenByStack.current.add(top)
      registry.current.get(top)?.close()
    }
    if (!stack.current.includes(id)) stack.current.push(id)
    registry.current.get(id)?.open()
  }, [])

  const onClosed = useCallback((id: string): boolean => {
    if (hiddenByStack.current.has(id)) {
      // This sheet was hidden by a push() — its close animation just finished. Don't pop the stack.
      hiddenByStack.current.delete(id)
      return false
    }
    const idx = stack.current.lastIndexOf(id)
    if (idx === -1) return false
    stack.current.splice(idx, 1)
    // Re-open whatever was below this sheet in the stack.
    const newTop = stack.current[stack.current.length - 1]
    if (newTop) registry.current.get(newTop)?.open()
    return true
  }, [])

  const dismissAll = useCallback(() => {
    const all = [...stack.current]
    // Clear before closing so the onChange(-1) callbacks don't try to re-open anything.
    stack.current = []
    hiddenByStack.current.clear()
    all.forEach((id) => registry.current.get(id)?.close())
  }, [])

  return (
    <SheetStackContext.Provider value={{ register, push, onClosed, dismissAll }}>
      {children}
    </SheetStackContext.Provider>
  )
}

export function useSheetStack() {
  const ctx = useContext(SheetStackContext)
  if (!ctx) throw new Error('useSheetStack must be used within a SheetStackProvider')
  return ctx
}
