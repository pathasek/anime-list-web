// Moderní informační ikona (kroužek + „i") — náhrada za textový znak ⓘ.
// Dědí velikost z font-size (1em) a barvu z currentColor, takže funguje
// všude, kde předtím seděl textový znak, včetně obarvení přes style/color.
function InfoIcon({ size = '1em', style }) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ verticalAlign: '-0.125em', ...style }}
            aria-hidden="true"
        >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
    )
}

export default InfoIcon
