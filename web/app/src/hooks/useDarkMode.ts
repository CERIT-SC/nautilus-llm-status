import { useEffect, useState } from 'react'

/**
 * Track dark mode by observing the `dark` class on <html>.
 * SSR-safe: returns false when document is undefined.
 * Cleanup: disconnects the MutationObserver on unmount.
 */
export function useDarkMode(): boolean {
  const [isDark, setIsDark] = useState<boolean>(() =>
    typeof document !== 'undefined'
      ? document.documentElement.classList.contains('dark')
      : false,
  )

  useEffect(() => {
    if (typeof document === 'undefined') return

    const update = () =>
      setIsDark(document.documentElement.classList.contains('dark'))

    update()

    const observer = new MutationObserver(update)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    })
    return () => observer.disconnect()
  }, [])

  return isDark
}
