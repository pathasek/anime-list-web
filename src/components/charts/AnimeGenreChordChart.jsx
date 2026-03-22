import React, { useMemo, useState } from 'react';
import { excelPalettes } from '../../utils/excelStyles';

const AnimeGenreChordChart = ({ data }) => {
    // We expect `data.list` or just the `animeList` to be passed
    const { matrix, groups, labels } = useMemo(() => {
        if (!data || !Array.isArray(data)) return { matrix: [], groups: [], labels: [] };

        const genreCounts = {};
        const coOccurrence = {};

        // Parse genres from anime list
        data.forEach(anime => {
            if (anime.genres) {
                const parts = anime.genres.split(';').map(g => g.trim()).filter(Boolean);
                parts.forEach(g => {
                    genreCounts[g] = (genreCounts[g] || 0) + 1;
                });
                
                // Track co-occurrences
                for (let i = 0; i < parts.length; i++) {
                    for (let j = i + 1; j < parts.length; j++) {
                        const g1 = parts[i];
                        const g2 = parts[j];
                        
                        if (!coOccurrence[g1]) coOccurrence[g1] = {};
                        if (!coOccurrence[g2]) coOccurrence[g2] = {};
                        
                        coOccurrence[g1][g2] = (coOccurrence[g1][g2] || 0) + 1;
                        coOccurrence[g2][g1] = (coOccurrence[g2][g1] || 0) + 1;
                    }
                }
            }
        });

        // Take top 15 genres to fit Kelly's palette limit cleanly
        const topGenres = Object.entries(genreCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 15)
            .map(x => x[0]);

        // Build chord matrix
        const m = topGenres.map(g1 => topGenres.map(g2 => {
            if (g1 === g2) return genreCounts[g1] || 0; // Self weight
            return coOccurrence[g1]?.[g2] || 0;
        }));

        // Calculate groups (arcs)
        let totalSum = 0;
        const rowSums = m.map(row => {
            const sum = row.reduce((a, b) => a + b, 0);
            totalSum += sum;
            return sum;
        });

        const numGroups = m.length;
        const padAngle = 0.05; // gap between arcs
        const totalPad = padAngle * numGroups;
        const availableSpace = (Math.PI * 2) - totalPad;

        const grps = [];
        let currentAngle = 0;

        for (let i = 0; i < numGroups; i++) {
            const val = rowSums[i];
            const ratio = val / totalSum;
            const spanAngle = ratio * availableSpace;
            const startAngle = currentAngle;
            const endAngle = startAngle + spanAngle;

            grps.push({
                index: i,
                value: val,
                startAngle,
                endAngle,
                color: excelPalettes.kellysMaxContrast[i % excelPalettes.kellysMaxContrast.length]
            });
            currentAngle = endAngle + padAngle;
        }

        return { matrix: m, groups: grps, labels: topGenres };
    }, [data]);

    const [hoveredIndex, setHoveredIndex] = useState(null);

    if (!groups.length) return <div>Data pro Chord Chart chybí.</div>;

    const width = 800;
    const height = 800;
    const cx = width / 2;
    const cy = height / 2;
    const outerRadius = 320;
    const innerRadius = 300;

    const getArcPath = (startAngle, endAngle, r1, r2) => {
        // Adjust angles to start from top
        const s = startAngle - Math.PI / 2;
        const e = endAngle - Math.PI / 2;

        const p1 = { x: cx + r2 * Math.cos(s), y: cy + r2 * Math.sin(s) };
        const p2 = { x: cx + r2 * Math.cos(e), y: cy + r2 * Math.sin(e) };
        const p3 = { x: cx + r1 * Math.cos(e), y: cy + r1 * Math.sin(e) };
        const p4 = { x: cx + r1 * Math.cos(s), y: cy + r1 * Math.sin(s) };

        const largeArc = (e - s) > Math.PI ? 1 : 0;

        return `M ${p1.x} ${p1.y} 
                A ${r2} ${r2} 0 ${largeArc} 1 ${p2.x} ${p2.y} 
                L ${p3.x} ${p3.y} 
                A ${r1} ${r1} 0 ${largeArc} 0 ${p4.x} ${p4.y} 
                Z`;
    };

    const ribbons = [];

    // Map subgroups
    const subgroupAngles = groups.map(() => ({ currentStart: 0 }));
    
    // First initialize start angles
    groups.forEach((g, i) => {
        subgroupAngles[i].currentStart = g.startAngle;
    });

    for (let i = 0; i < matrix.length; i++) {
        for (let j = 0; j < matrix.length; j++) {
            if (matrix[i][j] > 0 && i !== j) {
                // To avoid duplicate drawing, only draw i < j, but combined logic is needed
                if (i > j) continue; 
                
                const val = matrix[i][j];

                // Source segment on group i
                const sourceSpan = (val / groups[i].value) * (groups[i].endAngle - groups[i].startAngle);
                const sourceStart = subgroupAngles[i].currentStart;
                const sourceEnd = sourceStart + sourceSpan;
                subgroupAngles[i].currentStart = sourceEnd;

                // Target segment on group j
                const targetVal = matrix[j][i]; // Same value
                const targetSpan = (targetVal / groups[j].value) * (groups[j].endAngle - groups[j].startAngle);
                const targetStart = subgroupAngles[j].currentStart;
                const targetEnd = targetStart + targetSpan;
                subgroupAngles[j].currentStart = targetEnd;

                // Build Bezier ribbon
                const s1 = sourceStart - Math.PI / 2;
                const e1 = sourceEnd - Math.PI / 2;
                const s2 = targetStart - Math.PI / 2;
                const e2 = targetEnd - Math.PI / 2;

                const p1 = { x: cx + innerRadius * Math.cos(s1), y: cy + innerRadius * Math.sin(s1) };
                const p2 = { x: cx + innerRadius * Math.cos(e1), y: cy + innerRadius * Math.sin(e1) };
                const p3 = { x: cx + innerRadius * Math.cos(s2), y: cy + innerRadius * Math.sin(s2) };
                const p4 = { x: cx + innerRadius * Math.cos(e2), y: cy + innerRadius * Math.sin(e2) };

                const d = `M ${p1.x} ${p1.y}
                           A ${innerRadius} ${innerRadius} 0 0 1 ${p2.x} ${p2.y}
                           Q ${cx} ${cy} ${p3.x} ${p3.y}
                           A ${innerRadius} ${innerRadius} 0 0 1 ${p4.x} ${p4.y}
                           Q ${cx} ${cy} ${p1.x} ${p1.y} Z`;

                ribbons.push({
                    id: `${i}-${j}`,
                    sourceIndex: i,
                    targetIndex: j,
                    color: groups[i].color, // Use source color with alpha
                    d: d,
                    val: val
                });
            }
        }
    }

    return (
        <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: '100%', backgroundColor: '#1E1E1E', fontFamily: '"Aptos Narrow", sans-serif' }}>
            {/* Draw Ribbons */}
            {ribbons.map(ribbon => {
                const isHovered = hoveredIndex === null || hoveredIndex === ribbon.sourceIndex || hoveredIndex === ribbon.targetIndex;
                const opacity = isHovered ? 0.6 : 0.05;
                
                return (
                    <path
                        key={ribbon.id}
                        d={ribbon.d}
                        fill={ribbon.color}
                        fillOpacity={opacity}
                        style={{ transition: 'fill-opacity 0.2s' }}
                    />
                );
            })}

            {/* Draw Arcs and Labels */}
            {groups.map((g, i) => {
                const isHovered = hoveredIndex === null || hoveredIndex === i;
                const arcPath = getArcPath(g.startAngle, g.endAngle, innerRadius, outerRadius);
                
                // Label Position
                const midAngle = (g.startAngle + g.endAngle) / 2 - Math.PI / 2;
                const labelRadius = outerRadius + 15;
                const labelX = cx + labelRadius * Math.cos(midAngle);
                const labelY = cy + labelRadius * Math.sin(midAngle);
                const alignRight = Math.cos(midAngle) < 0;
                
                return (
                    <g 
                        key={g.index} 
                        onMouseEnter={() => setHoveredIndex(i)} 
                        onMouseLeave={() => setHoveredIndex(null)}
                        style={{ cursor: 'pointer' }}
                    >
                        <path 
                            d={arcPath} 
                            fill={g.color} 
                            opacity={isHovered ? 1 : 0.2}
                            style={{ transition: 'opacity 0.2s', filter: isHovered ? 'drop-shadow(0 0 8px rgba(255,255,255,0.4))' : 'none' }}
                        />
                        <text
                            x={labelX}
                            y={labelY}
                            fill="#E0E0E0"
                            fontSize="14px"
                            fontWeight="bold"
                            textAnchor={alignRight ? 'end' : 'start'}
                            dominantBaseline="middle"
                            opacity={isHovered ? 1 : 0.4}
                            style={{ pointerEvents: 'none', transition: 'opacity 0.2s' }}
                        >
                            {labels[i]}
                        </text>
                    </g>
                );
            })}
        </svg>
    );
};

export default AnimeGenreChordChart;
