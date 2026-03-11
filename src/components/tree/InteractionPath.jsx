import React, { memo } from 'react';

/**
 * Draws a glowing curved path between two node coordinates.
 */
const InteractionPath = memo(function InteractionPath({
    startX, startY, endX, endY,
    isActive = false,
    isMaxed = false,
    colorClass = 'primary'
}) {
    // The nodes are rendered with top-left origins.
    const nodeWidth = 200; // Updated matching the CSS rules
    const nodeHeight = 80;

    const p1x = startX + nodeWidth;
    const p1y = startY + (nodeHeight / 2);

    const p2x = endX;
    const p2y = endY + (nodeHeight / 2);

    // Calculate control points for a smooth S-curve horizontally
    const distanceX = Math.abs(p2x - p1x);
    // Lower stiffness for sharper sharper web-modern curves instead of bubbly
    const stiffness = Math.max(30, distanceX * 0.4);

    const cp1x = p1x + stiffness;
    const cp1y = p1y;
    const cp2x = p2x - stiffness;
    const cp2y = p2y;

    const pathData = `M ${p1x} ${p1y} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2x} ${p2y}`;

    // Styling logic
    let strokeClass = 'path-v2-locked';
    if (isActive) strokeClass = `path-v2-active path-v2-${colorClass}`;
    if (isMaxed) strokeClass = `path-v2-maxed path-v2-${colorClass}`;

    return (
        <g className="tree-connection-layer">
            <path
                d={pathData}
                fill="none"
                strokeWidth={isActive ? "3" : "2"}
                className={strokeClass}
                strokeLinecap="round"
                strokeDasharray={(!isActive) ? "4,6" : "none"}
            />
        </g>
    );
});

export default InteractionPath;
