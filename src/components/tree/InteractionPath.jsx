import React from 'react';

/**
 * Draws a glowing curved path between two node coordinates.
 */
export default function InteractionPath({
    startX, startY, endX, endY,
    isActive = false,
    isMaxed = false,
    colorClass = 'primary'
}) {
    // The nodes are rendered with top-left origins normally.
    const nodeWidth = 160; // Matches physical CSS width
    const nodeHeight = 68; // Box base height approximation

    // Connect right side of start to left side of end
    // Or if it's a vertical drop, bottom of start to top of end.
    // We'll use a standard left-to-right cubic bezier for now.

    // Port logic:
    const p1x = startX + nodeWidth;
    const p1y = startY + (nodeHeight / 2);

    const p2x = endX;
    const p2y = endY + (nodeHeight / 2);

    // Calculate control points for a smooth S-curve horizontally
    // The "stiffness" of the curve depends on the horizontal distance.
    const distanceX = Math.abs(p2x - p1x);
    const stiffness = Math.max(50, distanceX * 0.5);

    const cp1x = p1x + stiffness;
    const cp1y = p1y;
    const cp2x = p2x - stiffness;
    const cp2y = p2y;

    const pathData = `M ${p1x} ${p1y} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2x} ${p2y}`;

    // Styling logic
    let strokeClass = 'path-locked';
    if (isActive) strokeClass = `path-active path-${colorClass}`;
    if (isMaxed) strokeClass = `path-maxed path-${colorClass}`;

    return (
        <g className="tree-connection-layer">
            {/* Background shadow path for depth */}
            {isActive && (
                <path
                    d={pathData}
                    fill="none"
                    strokeWidth="6"
                    className={`path-glow glow-${colorClass}`}
                    strokeLinecap="round"
                />
            )}

            {/* Main Path */}
            <path
                d={pathData}
                fill="none"
                strokeWidth={isActive ? "3" : "2"}
                className={strokeClass}
                strokeLinecap="round"
                strokeDasharray={(!isActive) ? "5,5" : "none"}
            />
        </g>
    );
}
