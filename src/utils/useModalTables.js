import { useEffect } from 'react'

// Sdílená logika pro modaly zobrazující DOCX rozbory s tabulkami
// (.category-detail-modal-body). Dělá tři věci:
//
// 1) scroll-x fallback: normálně se buňky zalamují a tabulka se vejde do šířky.
//    Když má tabulka tolik sloupců, že by na sloupec zbylo míň než ~110 px
//    (zbytečně úzké/vysoké řádky), povolí se horizontální scroll (.scroll-x).
//
// 2) push-off sticky hlavičky: hlavička nemá dojet až na konec tabulky —
//    jakmile horní hrana POSLEDNÍHO řádku dosáhne spodku hlavičky, hlavička
//    odjíždí nahoru (drží se tedy nejdéle na předposledním řádku).
//
// 3) .is-stuck na wrapperu: dokud tabulka stojí na místě, mají krajní buňky
//    hlavičky zaoblené rohy (wrapper kvůli sticky nesmí clipovat). Jakmile se
//    hlavička při scrollu „chytne" a tabulka pod ní podjíždí, třída .is-stuck
//    rohy přes CSS transition plynule zhranatí (a zpět).
export function useModalTables(bodyRef, active) {
    useEffect(() => {
        if (!active) return
        const body = bodyRef.current
        if (!body) return
        const MIN_COL = 110

        const apply = () => {
            body.querySelectorAll('.category-detail-table-wrapper').forEach(wrap => {
                const cols = wrap.querySelectorAll('thead th').length || 1
                const table = wrap.querySelector('table')
                // Kromě heuristiky počtu sloupců i reálné přetečení (dlouhá
                // nezalomitelná slova zvedají min. šířku sloupců)
                const tooCramped = cols * MIN_COL > wrap.clientWidth ||
                    (table && table.scrollWidth > wrap.clientWidth + 2)
                wrap.classList.toggle('scroll-x', tooCramped)
            })
        }

        const baseTop = -Math.round(parseFloat(getComputedStyle(body).paddingTop || '0'))
        const syncSticky = () => {
            const bodyTop = body.getBoundingClientRect().top
            body.querySelectorAll('.category-detail-table-wrapper').forEach(wrap => {
                const thead = wrap.querySelector('thead')
                const rows = wrap.querySelectorAll('tbody tr')
                if (!thead || rows.length === 0) return
                const headH = thead.getBoundingClientRect().height
                const lastTop = rows[rows.length - 1].getBoundingClientRect().top
                const overshoot = (bodyTop + headH) - lastTop
                const topVal = overshoot > 0 ? baseTop - overshoot : baseTop
                const top = Math.round(topVal) + 'px'
                if (thead.style.top !== top) thead.style.top = top
                // Hlavička je „chycená", když ji sticky drží níž, než je její
                // přirozená pozice u horní hrany wrapperu (top wrapperu vyjel nad top body)
                // a zároveň ji ještě neodtlačil poslední řádek (overshoot <= 0).
                const stuck = wrap.getBoundingClientRect().top < bodyTop - 2 && overshoot <= 0
                wrap.classList.toggle('is-stuck', stuck)
            })
        }

        const onResize = () => { apply(); syncSticky() }
        apply()
        syncSticky()
        body.addEventListener('scroll', syncSticky, { passive: true })
        window.addEventListener('resize', onResize)
        return () => {
            body.removeEventListener('scroll', syncSticky)
            window.removeEventListener('resize', onResize)
        }
    }, [bodyRef, active])
}
