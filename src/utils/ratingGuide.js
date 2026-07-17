// Texty průvodců hodnocením (kategorie / epizody / FH) načítané z
// data/rating_guide.json — generuje ho export_rating_guide.py z WORD dokumentu
// „Hodnocení - Průvodce (WEB).docx" na ploše. Web texty z JSON překrývá přes
// zabudované konstanty; když soubor chybí nebo je neúplný, zůstávají fallbacky
// v kódu (RatingGuideModals.jsx, AnimeRatings.jsx).
import { useEffect, useState } from 'react'

let cache = null
let promise = null

function loadRatingGuide() {
    if (!promise) {
        promise = fetch('data/rating_guide.json?v=' + Date.now())
            .then(r => (r.ok ? r.json() : null))
            .catch(() => null)
            .then(json => { cache = json; return json })
    }
    return promise
}

export function useRatingGuide() {
    const [guide, setGuide] = useState(cache)
    useEffect(() => {
        if (cache) return undefined
        let alive = true
        loadRatingGuide().then(json => { if (alive && json) setGuide(json) })
        return () => { alive = false }
    }, [])
    return guide
}
