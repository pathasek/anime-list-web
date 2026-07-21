import React, { useState, useEffect } from 'react';
import './AiringCalendar.css';

const DAYS_OF_WEEK = [
    { id: 1, name: 'Pondělí', short: 'Po' },
    { id: 2, name: 'Úterý', short: 'Út' },
    { id: 3, name: 'Středa', short: 'St' },
    { id: 4, name: 'Čtvrtek', short: 'Čt' },
    { id: 5, name: 'Pátek', short: 'Pá' },
    { id: 6, name: 'Sobota', short: 'So' },
    { id: 7, name: 'Neděle', short: 'Ne' }
];

const parseWeekday = (timeStr) => {
    if (!timeStr) return 0;
    const s = timeStr.toLowerCase();
    if (s.includes('ponděl')) return 1;
    if (s.includes('úter')) return 2;
    if (s.includes('střed')) return 3;
    if (s.includes('čtvrtek')) return 4;
    if (s.includes('pátek')) return 5;
    if (s.includes('sobot')) return 6;
    if (s.includes('neděl')) return 7;
    return 0; // Neznámý / Unknown
};

const AiringCalendar = () => {
    const [schedule, setSchedule] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchSchedule = async () => {
            try {
                const res = await fetch(`data/airing_schedule.json?v=${Date.now()}`);
                if (!res.ok) throw new Error('Airing schedule data not found. Please run the VBA macro first.');
                const data = await res.json();
                setSchedule(data);
                setLoading(false);
            } catch (err) {
                setError(err.message);
                setLoading(false);
            }
        };
        fetchSchedule();
    }, []);

    if (loading) return <div className="loading">Načítám kalendář vysílání...</div>;
    if (error) return <div className="error">Chyba: {error}</div>;

    // Skupinovat anime podle dnů
    const scheduleByDay = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [], 0: [] };
    
    schedule.forEach(anime => {
        const day = parseWeekday(anime.time);
        scheduleByDay[day].push(anime);
    });

    // Seřadit anime uvnitř dnů podle času
    Object.keys(scheduleByDay).forEach(day => {
        scheduleByDay[day].sort((a, b) => {
            const timeA = a.time.match(/\d{1,2}:\d{2}/) ? a.time.match(/\d{1,2}:\d{2}/)[0] : '23:59';
            const timeB = b.time.match(/\d{1,2}:\d{2}/) ? b.time.match(/\d{1,2}:\d{2}/)[0] : '23:59';
            return timeA.localeCompare(timeB);
        });
    });

    return (
        <div className="airing-calendar-page fade-in">
            <header className="page-header">
                <div className="header-icon">📅</div>
                <div>
                    <h1>Kalendář vysílání</h1>
                    <p className="page-subtitle">Sleduj svá aktuálně vycházející (Airing) anime</p>
                </div>
            </header>

            <div className="calendar-grid">
                {DAYS_OF_WEEK.map(day => {
                    const todayAnime = scheduleByDay[day.id];
                    const isToday = new Date().getDay() === (day.id === 7 ? 0 : day.id);

                    return (
                        <div key={day.id} className={`calendar-column ${isToday ? 'is-today' : ''}`}>
                            <div className="calendar-column-header">
                                <h3>{day.name}</h3>
                                {isToday && <span className="today-badge">Dnes</span>}
                            </div>
                            
                            <div className="calendar-column-content">
                                {todayAnime.length === 0 ? (
                                    <div className="empty-day">Nic nevychází</div>
                                ) : (
                                    todayAnime.map((anime, idx) => (
                                        <div key={idx} className="airing-card hover-glow">
                                            <div className="airing-time">
                                                {anime.time.match(/\d{1,2}:\d{2}/) ? anime.time.match(/\d{1,2}:\d{2}/)[0] : 'TBA'}
                                            </div>
                                            <div className="airing-title" title={anime.name}>{anime.name}</div>
                                            
                                            <div className="airing-stats">
                                                <span className={`status-badge ${anime.remaining > 0 ? 'pending' : 'caught-up'}`}>
                                                    {anime.remaining > 0 ? `${anime.remaining} EP čeká` : 'Aktuální'}
                                                </span>
                                                <span className="watched-badge">Zhlédnuto: {anime.watched}</span>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Nezařazená anime (neznámý čas) */}
            {scheduleByDay[0].length > 0 && (
                <div className="unknown-day-section">
                    <h3>Neznámý čas vysílání (N/A)</h3>
                    <div className="unknown-grid">
                        {scheduleByDay[0].map((anime, idx) => (
                            <div key={idx} className="airing-card">
                                <div className="airing-title">{anime.name}</div>
                                <div className="airing-stats">
                                    <span className={`status-badge ${anime.remaining > 0 ? 'pending' : 'caught-up'}`}>
                                        {anime.remaining > 0 ? `${anime.remaining} EP čeká` : 'Aktuální'}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default AiringCalendar;
