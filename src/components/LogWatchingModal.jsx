import { useState, useEffect } from 'react'

function LogWatchingModal({ isOpen, onClose, onSubmit, animeList = [] }) {
    const [formData, setFormData] = useState({
        name: '',
        episodes: '',
        episodeRange: '',
        time: '',
        date: new Date().toISOString().split('T')[0]
    })
    const [suggestions, setSuggestions] = useState([])
    const [showSuggestions, setShowSuggestions] = useState(false)

    // Lock body scroll when modal is open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden'
        } else {
            document.body.style.overflow = ''
        }
        return () => {
            document.body.style.overflow = ''
        }
    }, [isOpen])

    if (!isOpen) return null

    const handleNameChange = (e) => {
        const value = e.target.value
        setFormData(prev => ({ ...prev, name: value }))

        // Filter suggestions
        if (value.length > 1) {
            const filtered = animeList
                .filter(a => a.name?.toLowerCase().includes(value.toLowerCase()))
                .slice(0, 5)
            setSuggestions(filtered)
            setShowSuggestions(true)
        } else {
            setSuggestions([])
            setShowSuggestions(false)
        }
    }

    const selectSuggestion = (anime) => {
        setFormData(prev => ({
            ...prev,
            name: anime.name,
            time: `${Math.round((anime.episode_duration || 24) * parseInt(prev.episodes || 1))} min`
        }))
        setShowSuggestions(false)
    }

    const handleEpisodesChange = (e) => {
        const value = e.target.value
        setFormData(prev => ({
            ...prev,
            episodes: value,
            time: `${Math.round(24 * parseInt(value || 1))} min`
        }))
    }

    const handleSubmit = (e) => {
        e.preventDefault()
        if (formData.name && formData.episodes) {
            const entry = {
                name: formData.name,
                episodes: `(${formData.episodes}x) ${formData.episodeRange || ''}`.trim(),
                time: formData.time || `${parseInt(formData.episodes) * 24} min`,
                date: new Date(formData.date).toISOString()
            }
            onSubmit(entry)
            // Reset form
            setFormData({
                name: '',
                episodes: '',
                episodeRange: '',
                time: '',
                date: new Date().toISOString().split('T')[0]
            })
            onClose()
        }
    }

    const handleBackdropClick = (e) => {
        if (e.target === e.currentTarget) {
            onClose()
        }
    }

    return (
        <div
            className="modal-backdrop"
            onClick={handleBackdropClick}
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0, 0, 0, 0.7)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1000,
                padding: 'var(--spacing-md)'
            }}
        >
            <div
                className="modal-content card"
                style={{
                    maxWidth: '500px',
                    width: '100%',
                    maxHeight: '90vh',
                    overflow: 'auto'
                }}
            >
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 'var(--spacing-lg)'
                }}>
                    <h3 style={{ margin: 0 }}>Zaznamenat sledování</h3>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--color-text-muted)',
                            cursor: 'pointer',
                            fontSize: '1.5rem'
                        }}
                    >
                        ×
                    </button>
                </div>

                <form onSubmit={handleSubmit}>
                    {/* Anime Name with autocomplete */}
                    <div style={{ marginBottom: 'var(--spacing-md)', position: 'relative' }}>
                        <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>
                            Anime *
                        </label>
                        <input
                            type="text"
                            value={formData.name}
                            onChange={handleNameChange}
                            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                            className="search-input"
                            style={{ width: '100%' }}
                            placeholder="Začněte psát název anime..."
                        />
                        {showSuggestions && suggestions.length > 0 && (
                            <div style={{
                                position: 'absolute',
                                top: '100%',
                                left: 0,
                                right: 0,
                                background: 'var(--color-bg-elevated)',
                                border: '1px solid var(--color-border)',
                                borderRadius: 'var(--radius-sm)',
                                maxHeight: '200px',
                                overflow: 'auto',
                                zIndex: 10
                            }}>
                                {suggestions.map((a, i) => (
                                    <div
                                        key={i}
                                        onClick={() => selectSuggestion(a)}
                                        style={{
                                            padding: 'var(--spacing-sm) var(--spacing-md)',
                                            cursor: 'pointer',
                                            borderBottom: '1px solid var(--color-border)'
                                        }}
                                        onMouseOver={(e) => e.target.style.background = 'var(--color-bg-hover)'}
                                        onMouseOut={(e) => e.target.style.background = 'transparent'}
                                    >
                                        {a.name}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Episodes count and range */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-md)', marginBottom: 'var(--spacing-md)' }}>
                        <div>
                            <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>
                                Počet epizod *
                            </label>
                            <input
                                type="number"
                                value={formData.episodes}
                                onChange={handleEpisodesChange}
                                className="search-input"
                                style={{ width: '100%' }}
                                min="1"
                                placeholder="6"
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>
                                Rozsah (volitelné)
                            </label>
                            <input
                                type="text"
                                value={formData.episodeRange}
                                onChange={(e) => setFormData(prev => ({ ...prev, episodeRange: e.target.value }))}
                                className="search-input"
                                style={{ width: '100%' }}
                                placeholder="EP 1-6"
                            />
                        </div>
                    </div>

                    {/* Time and Date */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-md)', marginBottom: 'var(--spacing-lg)' }}>
                        <div>
                            <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>
                                Čas sledování
                            </label>
                            <input
                                type="text"
                                value={formData.time}
                                onChange={(e) => setFormData(prev => ({ ...prev, time: e.target.value }))}
                                className="search-input"
                                style={{ width: '100%' }}
                                placeholder="144 min"
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>
                                Datum
                            </label>
                            <input
                                type="date"
                                value={formData.date}
                                onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
                                className="search-input"
                                style={{ width: '100%' }}
                            />
                        </div>
                    </div>

                    {/* Buttons */}
                    <div style={{ display: 'flex', gap: 'var(--spacing-md)', justifyContent: 'flex-end' }}>
                        <button type="button" onClick={onClose} className="btn btn-secondary">
                            Zrušit
                        </button>
                        <button type="submit" className="btn btn-primary">
                            Zaznamenat
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}

export default LogWatchingModal
