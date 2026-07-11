import { useEffect } from 'react'

// Zamkne scroll pozadí, dokud je modal otevřený (active = true).
// Zamyká se <html> (scroll container stránky) a případný .anime-detail-overlay
// (detail anime má vlastní fixed scroll container nad seznamem).
// Proti posunu obsahu při zmizení scrollbaru NEkompenzujeme paddingem —
// oba scroll containery mají v index.css `scrollbar-gutter: stable`,
// takže místo pro scrollbar zůstává rezervované a layout se nehne.
export function useModalScrollLock(active = true) {
    useEffect(() => {
        if (!active) return
        const html = document.documentElement
        const overlay = document.querySelector('.anime-detail-overlay')
        const prevHtml = html.style.overflow
        const prevOverlay = overlay ? overlay.style.overflow : null
        html.style.overflow = 'hidden'
        if (overlay) overlay.style.overflow = 'hidden'
        return () => {
            html.style.overflow = prevHtml
            if (overlay) overlay.style.overflow = prevOverlay
        }
    }, [active])
}
