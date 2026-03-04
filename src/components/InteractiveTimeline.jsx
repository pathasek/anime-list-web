import React, { useState, useEffect, useMemo, useRef } from 'react';
import './InteractiveTimeline.css';

const InteractiveTimeline = ({ historyData }) => {
    const [animeMap, setAnimeMap] = useState({});
    const timelineRef = useRef(null);

    // Fetch anime list for images
    useEffect(() => {
        fetch(`data/anime_list.json?v=${Date.now()}`)
            .then(res => res.json())
            .then(data => {
                const map = {};
                data.forEach(anime => {
                    if (anime.name) {
                        map[anime.name.toLowerCase()] = anime;
                    }
                });
                setAnimeMap(map);
            })
            .catch(err => console.error("Failed to fetch anime list for timeline", err));
    }, []);

    // Cluster the data
    const milestones = useMemo(() => {
        if (!historyData || historyData.length === 0) return [];

        // Sort history oldest to newest
        const sortedHistory = [...historyData].sort((a, b) => {
            return new Date(a.date).getTime() - new Date(b.date).getTime();
        });

        const clustered = [];

        sortedHistory.forEach(entry => {
            if (!entry.date || !entry.name) return;

            const epMatch = entry.episodes?.match(/\d+/);
            const eps = epMatch ? parseInt(epMatch[0]) : 0;
            const entryDate = new Date(entry.date);

            // Check if we can merge with the last cluster
            if (clustered.length > 0) {
                const lastCluster = clustered[clustered.length - 1];

                // If same anime, check date gap (let's say gap <= 3 days is a same streak)
                if (lastCluster.name.toLowerCase() === entry.name.toLowerCase()) {
                    const lastDate = new Date(lastCluster.endDate);
                    const diffTime = Math.abs(entryDate - lastDate);
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                    if (diffDays <= 3 && entryDate >= lastDate) { // only merge if the entry logic is sequential
                        // Merge
                        lastCluster.endDate = entry.date;
                        lastCluster.totalEpisodes += eps;
                        lastCluster.entriesCount += 1;
                        return;
                    }
                }
            }

            // Create new cluster
            clustered.push({
                name: entry.name,
                startDate: entry.date,
                endDate: entry.date,
                totalEpisodes: eps,
                entriesCount: 1,
                id: entry.date + entry.name + Math.random().toString(36).substr(2, 9)
            });
        });

        return clustered;
    }, [historyData]);

    // Format date correctly
    const formatDate = (dateString, showYear = false) => {
        const date = new Date(dateString);
        return date.toLocaleDateString('cs-CZ', {
            day: 'numeric',
            month: 'numeric',
            year: showYear ? 'numeric' : undefined
        });
    };

    const getAnimeImage = (name) => {
        const anime = animeMap[name.toLowerCase()];
        return anime?.thumbnail ? anime.thumbnail.replace(/#/g, '%23') : null;
    };

    // Scroll handlers
    const scrollLeft = () => {
        if (timelineRef.current) {
            timelineRef.current.scrollBy({ left: -400, behavior: 'smooth' });
        }
    };

    const scrollRight = () => {
        if (timelineRef.current) {
            timelineRef.current.scrollBy({ left: 400, behavior: 'smooth' });
        }
    };

    return (
        <div className="interactive-timeline-container fade-in">
            <div className="timeline-header">
                <h3>Vizuální cesta historií</h3>
                <div className="timeline-controls">
                    <button className="timeline-btn" onClick={scrollLeft} title="Posunout doleva">&larr;</button>
                    <button className="timeline-btn" onClick={scrollRight} title="Posunout doprava">&rarr;</button>
                </div>
            </div>

            <div className="timeline-scroll-area" ref={timelineRef}>
                <div className="timeline-track">
                    <div className="timeline-line"></div>

                    {milestones.map((milestone, index) => {
                        const image = getAnimeImage(milestone.name);

                        // Decide if the card is above or below the line
                        const isTop = index % 2 === 0;

                        // Strict check to not show range if it was just one day
                        const isSameDay = milestone.startDate.split('T')[0] === milestone.endDate.split('T')[0];
                        const dateDisplay = isSameDay
                            ? formatDate(milestone.startDate, true)
                            : `${formatDate(milestone.startDate)} - ${formatDate(milestone.endDate, true)}`;

                        return (
                            <div className={`timeline-node ${isTop ? 'node-top' : 'node-bottom'}`} key={milestone.id}>
                                <div className="timeline-dot"></div>
                                <div className="timeline-date">{dateDisplay}</div>

                                <div className="timeline-card">
                                    {image ? (
                                        <div className="timeline-card-image" style={{ backgroundImage: `url('${image}?v=${Date.now()}')` }}></div>
                                    ) : (
                                        <div className="timeline-card-placeholder">{milestone.name.substring(0, 2).toUpperCase()}</div>
                                    )}
                                    <div className="timeline-card-content">
                                        <div className="timeline-card-title" title={milestone.name}>{milestone.name}</div>
                                        <div className="timeline-card-stats">
                                            <span className="badge-episodes">{milestone.totalEpisodes} {milestone.totalEpisodes === 1 ? 'epizoda' : (milestone.totalEpisodes > 1 && milestone.totalEpisodes < 5) ? 'epizody' : 'epizod'}</span>
                                            {milestone.entriesCount > 1 && <span className="badge-days">{milestone.entriesCount} dní za sebou</span>}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}

                    {milestones.length === 0 && (
                        <div style={{ padding: '2rem', color: 'var(--text-muted)' }}>Zatím žádná historie pro časovou osu.</div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default InteractiveTimeline;
