import { useRef } from 'react'

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
 *   fullWidth     — if true and expanded, spans full grid width
 *   customPreview — if true, previewContent is rendered without the default wrapper
 *   previewContent — React node rendered in collapsed state (mini charts)
 *   children      — React nodes rendered in expanded state (full charts)
 */
function DashboardGroup({ id, title, icon, isExpanded, onToggle, alwaysExpanded = false, fullWidth = false, customPreview = false, previewContent, headerExtra, children }) {
    const contentRef = useRef(null)

    const showExpanded = isExpanded || alwaysExpanded

    return (
        <div 
            className={`dashboard-group ${showExpanded ? 'expanded' : ''}${fullWidth && showExpanded ? ' expanded-full-width' : ''}`}
            id={`group-${id}`}
            style={(showExpanded && (id === 'status' || id === 'lists')) ? { order: -1 } : undefined}
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
                    {headerExtra && <div className="dashboard-group-header-extra" onClick={(e) => e.stopPropagation()} style={{ marginLeft: '8px' }}>{headerExtra}</div>}
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

            {/* Collapsed preview — mini charts or custom layout */}
            {!showExpanded && previewContent && (
                customPreview ? previewContent : (
                    <div className="dashboard-group-preview">
                        {previewContent}
                    </div>
                )
            )}

            {showExpanded && (
                <div className={`dashboard-group-content${id === 'lists' ? ' lists-content' : ''}${id === 'status' ? ' status-content' : ''}`} ref={contentRef}>
                    {children}
                </div>
            )}
        </div>
    )
}

export default DashboardGroup
