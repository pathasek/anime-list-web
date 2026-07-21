import React, { useState, useMemo, useEffect } from 'react';
import YouTube from 'react-youtube';

const defaultOstList = [
    { title: "Attack on Titan S01 - ətˈæk 0N tάɪtn", id: "zroFzv7sFis", series: "Attack on Titan" },
    { title: "Attack on Titan S02 - Call of Silence", id: "VtguFyOdj2g", series: "Attack on Titan" },
    { title: "Attack on Titan S02 - Barricades", id: "BXsjKvdEae4", series: "Attack on Titan" },
    { title: "Attack on Titan S03 - Zero Eclipse", id: "TH4V94gBoXA", series: "Attack on Titan" },
    { title: "Attack on Titan Lost Girls - Call your name <Gv>", id: "hBdWb34RKwc", series: "Attack on Titan" },
    { title: "Bocchi The Rock! - That Band", id: "q-bCp4MxuYU", series: "Bocchi the Rock!" },
    { title: "Code Geass Akito - More Than Words", id: "BEN8rkq7Jr8", series: "Code Geass" },
    { title: "Code Geass R1 - Stories", id: "4GaxCGZqEvQ", series: "Code Geass" },
    { title: "Code Geass R1 - Masquerade", id: "1b0n10Ytidg", series: "Code Geass" },
    { title: "Naruto Shippuden - Spin and Burst", id: "1q8-I8k0KxA", series: "Naruto" },
    { title: "Eighty Six (86) - Voices of the Chord", id: "2aJUnltwsqs", series: "86" }
];

const extractYoutubeId = (url) => {
    if (!url) return null;
    // Matches youtu.be/<id> or youtube.com/watch?v=<id> or youtube.com/embed/<id>
    const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&?\/\s]+)/);
    return match ? match[1] : null;
};

export default function MusicPlayer({ animeData, selectedYear }) {
    const [isExpanded, setIsExpanded] = useState(false);
    const [activeMedia, setActiveMedia] = useState(null);
    const [dynamicOstList, setDynamicOstList] = useState([]);

    // Load full list from public/data/favorites_ost.json
    useEffect(() => {
        // Relativní cesta (ne '/data/...') — jinak se rozbije pod subcestou GitHub Pages
        fetch('data/favorites_ost.json')
            .then(r => r.json())
            .then(data => {
                if (data && data.pieces) {
                    const formatted = data.pieces
                        .map(p => {
                            const ytId = extractYoutubeId(p.ost_url);
                            if (!ytId) return null;
                            return {
                                title: `${p.anime_name} - ${p.ost_name}`,
                                id: ytId,
                                series: p.anime_name
                            };
                        })
                        .filter(Boolean);
                    
                    if (formatted.length > 0) {
                        setDynamicOstList(formatted);
                    }
                }
            })
            .catch(err => {
                console.error("Failed to load favorites_ost.json", err);
            });
    }, []);

    const fullOstList = useMemo(() => {
        return dynamicOstList.length > 0 ? dynamicOstList : defaultOstList;
    }, [dynamicOstList]);

    const filteredOstList = useMemo(() => {
        if (!animeData) return fullOstList;
        
        const watchedInYear = animeData.filter(a => {
            if (selectedYear === 'all') return true;
            if (!a.end_date) return false;
            return a.end_date.startsWith(selectedYear);
        });
        
        return fullOstList.filter(ost => 
            watchedInYear.some(a => a.name.toLowerCase().includes(ost.series.toLowerCase()))
        );
    }, [animeData, selectedYear, fullOstList]);

    // Random play
    const playRandom = () => {
        if (filteredOstList.length === 0) return;
        const randomOst = filteredOstList[Math.floor(Math.random() * filteredOstList.length)];
        setActiveMedia({ type: 'youtube', src: randomOst.id });
    };

    const youtubeOpts = {
        height: '100%',
        width: '100%',
        playerVars: {
            autoplay: 1,
            rel: 0,
            modestbranding: 1
        },
    };

    return (
        <div style={{
            position: 'fixed',
            bottom: '2rem',
            right: '2rem',
            zIndex: 99999,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            gap: '1rem'
        }}>
            {/* Player Container */}
            <div style={{
                width: '450px',
                background: 'rgba(20, 20, 30, 0.98)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: '16px',
                padding: '1rem',
                boxShadow: '0 10px 40px rgba(0,0,0,0.8)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                display: isExpanded ? 'flex' : 'none',
                flexDirection: 'column',
                gap: '1rem',
                animation: 'slideFadeIn 0.3s ease-out',
                // Celý přehrávač o 10 % větší se zachováním všech poměrů. Kotví
                // vpravo dole, takže roste doleva/nahoru a zůstává v rohu.
                // Minimalizovaná ikona (toggle níže) se záměrně NEškáluje.
                transform: 'scale(1.1)',
                transformOrigin: 'bottom right'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h4 style={{ margin: 0, fontSize: '1.1rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        🎵 Soundtrack Widget
                    </h4>
                    <button onClick={() => setIsExpanded(false)} style={{ background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '1.6rem', lineHeight: 1 }}>×</button>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: '0.85rem', color: '#9ca3af' }}>
                        Pro rok {selectedYear === 'all' ? 'All-Time' : selectedYear}: {filteredOstList.length} skladeb
                    </div>
                    <button onClick={playRandom} style={{
                        background: 'rgba(255, 255, 255, 0.15)',
                        border: '1px solid rgba(255, 255, 255, 0.3)',
                        color: 'white',
                        padding: '0.4rem 0.8rem',
                        borderRadius: '20px',
                        cursor: 'pointer',
                        fontSize: '0.85rem',
                        fontWeight: 'bold',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.25)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
                    >
                        🎲 Náhodně
                    </button>
                </div>

                {activeMedia ? (
                    <div style={{ width: '100%', aspectRatio: '16/9', background: 'black', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 4px 15px rgba(0,0,0,0.5)' }}>
                        {activeMedia.type === 'youtube' ? (
                            <YouTube 
                                videoId={activeMedia.src} 
                                opts={youtubeOpts} 
                                onEnd={playRandom}
                                style={{ width: '100%', height: '100%' }}
                            />
                        ) : (
                            <video 
                                width="100%" 
                                height="100%" 
                                controls 
                                autoPlay 
                                src={activeMedia.src}
                            />
                        )}
                    </div>
                ) : (
                    <div style={{ width: '100%', aspectRatio: '16/9', background: 'rgba(0,0,0,0.3)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: '0.9rem', border: '1px dashed rgba(255,255,255,0.1)' }}>
                        Vyber skladbu nebo klikni na Náhodně
                    </div>
                )}

                <div className="ost-list-container" style={{ maxHeight: '200px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px', paddingRight: '4px' }}>
                    {filteredOstList.length > 0 ? filteredOstList.map((ost, idx) => (
                        <button
                            key={idx}
                            onClick={() => {
                                setActiveMedia({ type: 'youtube', src: ost.id });
                            }}
                            style={{
                                background: activeMedia?.src === ost.id ? 'rgba(99, 102, 241, 0.25)' : 'transparent',
                                border: `1px solid ${activeMedia?.src === ost.id ? '#6366f1' : 'transparent'}`,
                                color: activeMedia?.src === ost.id ? '#fff' : '#9ca3af',
                                padding: '0.5rem 0.75rem',
                                borderRadius: '6px',
                                textAlign: 'left',
                                cursor: 'pointer',
                                fontSize: '0.85rem',
                                transition: 'all 0.15s',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                fontWeight: activeMedia?.src === ost.id ? 'bold' : 'normal',
                                display: 'block',
                                flexShrink: 0,
                                width: '100%'
                            }}
                            onMouseEnter={(e) => { if(activeMedia?.src !== ost.id) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'; }}
                            onMouseLeave={(e) => { if(activeMedia?.src !== ost.id) e.currentTarget.style.background = 'transparent'; }}
                        >
                            {ost.title}
                        </button>
                    )) : (
                        <div style={{ padding: '1rem', textAlign: 'center', color: '#9ca3af', fontSize: '0.85rem' }}>
                            Pro tento rok nemáš v databázi žádné dostupné soundtracky k tvým zhlédnutým anime.
                        </div>
                    )}
                </div>
            </div>

            {/* Toggle Button */}
            {!isExpanded && (
                <button 
                    onClick={() => setIsExpanded(true)}
                    style={{
                        width: '56px',
                        height: '56px',
                        borderRadius: '28px',
                        background: 'linear-gradient(135deg, #6366f1, #c084fc)',
                        border: 'none',
                        color: 'white',
                        fontSize: '1.6rem',
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        cursor: 'pointer',
                        boxShadow: '0 4px 20px rgba(99, 102, 241, 0.5)',
                        transition: 'transform 0.2s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
                    onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                >
                    🎵
                </button>
            )}
        </div>
    );
}
