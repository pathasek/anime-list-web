import { useRef, useEffect, useState } from 'react'

/**
 * DashboardGroup — collapsible group card for the Dashboard.
 * 
 * Props:
 *   id            — unique group identifier
 *   title         — display name (e.g. "Typy")
 *   icon          — emoji/icon string
 *   isExpanded    — controlled expansion state
 *   onToggle      — callback to toggle expand/collapse
 *   alwaysExpanded — if true, group is always open (no toggle button)
 *   previewContent — React node rendered in collapsed state (mini charts)
 *   children      — React nodes rendered in expanded state (full charts)
 */
function DashboardGroup({ id, title, icon, isExpanded, onToggle, alwaysExpanded = false, previewContent, children }) {
    const contentRef = useRef(null)
    const [contentHeight, setContentHeight] = useState(0)

    // Measure content height for smooth animation
    useEffect(() => {
        if (contentRef.current) {
            setContentHeight(contentRef.current.scrollHeight)
        }
    }, [isExpanded, children])

    const showExpanded = isExpanded || alwaysExpanded

    return (
        <div 
            className={`dashboard-group ${showExpanded ? 'expanded' : ''}`}
            id={`group-${id}`}
        >
            <div 
                className="dashboard-group-header"
                onClick={alwaysExpanded ? undefined : onToggle}
                role={alwaysExpanded ? undefined : "button"}
                tabIndex={alwaysExpanded ? undefined : 0}
                onKeyDown={alwaysExpanded ? undefined : (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        onToggle()
                    }
                }}
            >
                <div className="dashboard-group-title">
                    <span className="dashboard-group-icon">{icon}</span>
                    <h3>{title}</h3>
                </div>
                {!alwaysExpanded && (
                    <button 
                        className="group-expand-btn"
                        aria-label={isExpanded ? 'Sbalit skupinu' : 'Rozbalit skupinu'}
                        onClick={(e) => {
                            e.stopPropagation()
                            onToggle()
                        }}
                    >
                        <svg 
                            width="20" 
                            height="20" 
                            viewBox="0 0 24 24" 
                            fill="none" 
                            stroke="currentColor"
                            className={`group-expand-icon ${isExpanded ? 'rotated' : ''}`}
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                    </button>
                )}
            </div>

            {/* Collapsed preview — mini charts */}
            {!showExpanded && previewContent && (
                <div className="dashboard-group-preview">
                    {previewContent}
                </div>
            )}

            {/* Expanded content — full charts */}
            {showExpanded && (
                <div className={`dashboard-group-content${id === 'lists' ? ' lists-content' : ''}`} ref={contentRef}>
                    {children}
                </div>
            )}
        </div>
    )
}

export default DashboardGroup
