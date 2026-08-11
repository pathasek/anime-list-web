// Hlavička karty „Hodnocení epizod" (redesign): nadpis, badge s průměrem,
// tlačítko průvodce „?", legenda čar a legenda stupňů.
// Sdílí ji detail anime i split view na stránce Hodnocení.
// Zbytek grafu (pluginy, tooltip) je v utils/episodeChart.js.
import { RatingInfoButton } from './RatingGuideModals'
import { EPISODE_TIERS } from '../utils/episodeChart'

export default function EpisodeChartHeader({ avg, onGuideOpen, note }) {
    return (
        <div className="ep-chart-head">
            <div className="ep-chart-head-row">
                <h3 className="ep-chart-title">Hodnocení epizod</h3>

                {avg && (
                    <span className="ep-chart-avg">
                        <span className="ep-chart-avg-label">Průměr</span>
                        <span className="ep-chart-avg-value">{avg}</span>
                    </span>
                )}

                <RatingInfoButton
                    label="Jak hodnotím epizody"
                    className="ep-chart-guide"
                    onClick={onGuideOpen}
                />

                <span className="ep-chart-lineleg">
                    <span className="ep-chart-lineleg-mark is-trend"></span>Trend
                </span>
                <span className="ep-chart-lineleg">
                    <span className="ep-chart-lineleg-mark is-avg"></span>Průměr
                </span>

                <span className="ep-chart-tiers">
                    {EPISODE_TIERS.map(t => (
                        <span className="ep-chart-tier" key={t.name}>
                            <span className="ep-chart-tier-dot" style={{ background: t.color, color: t.color }}></span>
                            {t.name}
                        </span>
                    ))}
                </span>
            </div>

            {note && (
                <p className="category-ratings-info-text ep-chart-note">
                    Faktické rozbory epizod byly vygenerovány AI z webových zdrojů a mohou obsahovat chyby.
                    Kliknutím na bod (tečku) konkrétní epizody v grafu zobrazíte její detailní rozbor.
                </p>
            )}
        </div>
    )
}
