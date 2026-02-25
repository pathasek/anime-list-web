import { useState, useEffect } from 'react'

const defaultAnime = {
    name: '',
    type: 'TV',
    studio: '',
    genres: '',
    themes: '',
    episodes: '',
    episode_duration: 24,
    rating: '',
    release_date: '',
    dub: 'Sub',
    status: ''
}

const typeOptions = ['TV', 'Movie', 'OVA', 'ONA', 'TV Special', 'Special']
const dubOptions = ['Sub', 'Dub', 'Both']

function AddAnimeModal({ isOpen, onClose, onSubmit, editAnime = null }) {
    const [formData, setFormData] = useState(editAnime || defaultAnime)
    const [errors, setErrors] = useState({})

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

    const handleChange = (e) => {
        const { name, value } = e.target
        setFormData(prev => ({ ...prev, [name]: value }))
        // Clear error when field is edited
        if (errors[name]) {
            setErrors(prev => ({ ...prev, [name]: null }))
        }
    }

    const validate = () => {
        const newErrors = {}
        if (!formData.name.trim()) {
            newErrors.name = 'Název anime je povinný'
        }
        if (!formData.type) {
            newErrors.type = 'Typ je povinný'
        }
        setErrors(newErrors)
        return Object.keys(newErrors).length === 0
    }

    const handleSubmit = (e) => {
        e.preventDefault()
        if (validate()) {
            onSubmit(formData)
            setFormData(defaultAnime)
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
                    maxWidth: '600px',
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
                    <h3 style={{ margin: 0 }}>
                        {editAnime ? 'Upravit Anime' : 'Přidat Anime'}
                    </h3>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--color-text-muted)',
                            cursor: 'pointer',
                            fontSize: '1.5rem',
                            padding: '4px'
                        }}
                    >
                        ×
                    </button>
                </div>

                <form onSubmit={handleSubmit}>
                    {/* Name */}
                    <div className="form-group" style={{ marginBottom: 'var(--spacing-md)' }}>
                        <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>
                            Název Anime *
                        </label>
                        <input
                            type="text"
                            name="name"
                            value={formData.name}
                            onChange={handleChange}
                            className="search-input"
                            style={{ width: '100%', borderColor: errors.name ? 'var(--color-error)' : undefined }}
                            placeholder="např. Steins;Gate"
                        />
                        {errors.name && (
                            <span style={{ color: 'var(--color-error)', fontSize: '0.875rem' }}>
                                {errors.name}
                            </span>
                        )}
                    </div>

                    {/* Type & Studio Row */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-md)', marginBottom: 'var(--spacing-md)' }}>
                        <div className="form-group">
                            <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>
                                Typ *
                            </label>
                            <select
                                name="type"
                                value={formData.type}
                                onChange={handleChange}
                                className="search-input"
                                style={{ width: '100%' }}
                            >
                                {typeOptions.map(t => (
                                    <option key={t} value={t}>{t}</option>
                                ))}
                            </select>
                        </div>

                        <div className="form-group">
                            <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>
                                Studio
                            </label>
                            <input
                                type="text"
                                name="studio"
                                value={formData.studio}
                                onChange={handleChange}
                                className="search-input"
                                style={{ width: '100%' }}
                                placeholder="např. MAPPA"
                            />
                        </div>
                    </div>

                    {/* Genres & Themes */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-md)', marginBottom: 'var(--spacing-md)' }}>
                        <div className="form-group">
                            <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>
                                Žánry
                            </label>
                            <input
                                type="text"
                                name="genres"
                                value={formData.genres}
                                onChange={handleChange}
                                className="search-input"
                                style={{ width: '100%' }}
                                placeholder="Action; Drama; Sci-Fi"
                            />
                        </div>

                        <div className="form-group">
                            <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>
                                Témata
                            </label>
                            <input
                                type="text"
                                name="themes"
                                value={formData.themes}
                                onChange={handleChange}
                                className="search-input"
                                style={{ width: '100%' }}
                                placeholder="Time Travel; School"
                            />
                        </div>
                    </div>

                    {/* Episodes & Duration & Rating Row */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--spacing-md)', marginBottom: 'var(--spacing-md)' }}>
                        <div className="form-group">
                            <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>
                                Epizody
                            </label>
                            <input
                                type="number"
                                name="episodes"
                                value={formData.episodes}
                                onChange={handleChange}
                                className="search-input"
                                style={{ width: '100%' }}
                                min="1"
                                placeholder="12"
                            />
                        </div>

                        <div className="form-group">
                            <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>
                                Délka ep. (min)
                            </label>
                            <input
                                type="number"
                                name="episode_duration"
                                value={formData.episode_duration}
                                onChange={handleChange}
                                className="search-input"
                                style={{ width: '100%' }}
                                min="1"
                                placeholder="24"
                            />
                        </div>

                        <div className="form-group">
                            <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>
                                Hodnocení
                            </label>
                            <input
                                type="number"
                                name="rating"
                                value={formData.rating}
                                onChange={handleChange}
                                className="search-input"
                                style={{ width: '100%' }}
                                min="1"
                                max="10"
                                step="0.5"
                                placeholder="8.5"
                            />
                        </div>
                    </div>

                    {/* Release Date & Dub */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-md)', marginBottom: 'var(--spacing-lg)' }}>
                        <div className="form-group">
                            <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>
                                Datum vydání
                            </label>
                            <input
                                type="date"
                                name="release_date"
                                value={formData.release_date?.split('T')[0] || ''}
                                onChange={handleChange}
                                className="search-input"
                                style={{ width: '100%' }}
                            />
                        </div>

                        <div className="form-group">
                            <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>
                                Dabing
                            </label>
                            <select
                                name="dub"
                                value={formData.dub}
                                onChange={handleChange}
                                className="search-input"
                                style={{ width: '100%' }}
                            >
                                {dubOptions.map(d => (
                                    <option key={d} value={d}>{d}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Buttons */}
                    <div style={{ display: 'flex', gap: 'var(--spacing-md)', justifyContent: 'flex-end' }}>
                        <button
                            type="button"
                            onClick={onClose}
                            className="btn btn-secondary"
                        >
                            Zrušit
                        </button>
                        <button
                            type="submit"
                            className="btn btn-primary"
                        >
                            {editAnime ? 'Uložit změny' : 'Přidat Anime'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}

export default AddAnimeModal
