import React, { useMemo, useRef, useState, useLayoutEffect, useCallback } from 'react';

/**
 * TreeCanvas implements an infinite pan and zoom canvas.
 * Optimized: Uses direct DOM manipulation for transform to prevent React re-renders during drag/zoom.
 */
export default function TreeCanvas({ connections, skillNodes, nodes = [] }) {
    const containerRef = useRef(null);
    const worldRef = useRef(null);
    const transformRef = useRef({ x: 0, y: 0, scale: 1 });
    const [isDragging, setIsDragging] = useState(false);
    const [hasDragged, setHasDragged] = useState(false);
    const dragStart = useRef({ x: 0, y: 0 });

    const { minX, minY, worldW, worldH } = useMemo(() => {
        if (!nodes || nodes.length === 0) return { minX: 0, minY: 0, worldW: '100%', worldH: '100%' };

        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        const NODE_W = 200; // Increased base dimensions for new UI
        const NODE_H = 80;

        nodes.forEach(n => {
            if (n.x < minX) minX = n.x;
            if (n.x > maxX) maxX = n.x;
            if (n.y < minY) minY = n.y;
            if (n.y > maxY) maxY = n.y;
        });

        const PADDING_X = 500;
        const PADDING_Y = 500;

        return {
            minX: minX - PADDING_X,
            minY: minY - PADDING_Y,
            worldW: (maxX - minX) + NODE_W + PADDING_X * 2,
            worldH: (maxY - minY) + NODE_H + PADDING_Y * 2
        };
    }, [nodes]);

    // Apply transform directly to the DOM to bypass React render cycle
    const applyTransform = useCallback(() => {
        if (worldRef.current) {
            const { x, y, scale } = transformRef.current;
            worldRef.current.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
        }
    }, []);

    // Extract center view logic so it can be called on demand
    const centerView = useCallback(() => {
        if (containerRef.current && nodes.length > 0) {
            const root = nodes.find(n => n.id === 'singularity') || nodes[0];
            if (root) {
                const containerW = containerRef.current.clientWidth;
                const containerH = containerRef.current.clientHeight;

                // Center coordinates of the root node
                const contentX = root.x - minX + 100;
                const contentY = root.y - minY + 40;

                const initialScale = 1;
                const offsetX = (containerW / 2) - (contentX * initialScale);
                const offsetY = (containerH / 2) - (contentY * initialScale);

                transformRef.current = { x: offsetX, y: offsetY, scale: initialScale };
                applyTransform();
            }
        }
    }, [minX, minY, nodes, applyTransform]);

    // Auto-scroll to center (the root node) on first load
    useLayoutEffect(() => {
        centerView();
    }, [centerView]);

    // Interaction Handlers
    const handleMouseDown = useCallback((e) => {
        if (e.button !== 0 && e.button !== 1) return; // Only left/middle click
        e.preventDefault();
        setIsDragging(true);
        setHasDragged(false);
        dragStart.current = { x: e.clientX, y: e.clientY };
    }, []);

    const handleMouseMove = useCallback((e) => {
        if (!isDragging) return;

        const dx = e.clientX - dragStart.current.x;
        const dy = e.clientY - dragStart.current.y;

        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
            if (!hasDragged) setHasDragged(true);
        }

        transformRef.current.x += dx;
        transformRef.current.y += dy;
        applyTransform();

        dragStart.current = { x: e.clientX, y: e.clientY };
    }, [isDragging, hasDragged, applyTransform]);

    const handleMouseUpOrLeave = useCallback(() => {
        if (isDragging) setIsDragging(false);
    }, [isDragging]);

    const handleClickCapture = useCallback((e) => {
        if (hasDragged) {
            e.stopPropagation();
            setHasDragged(false);
        }
    }, [hasDragged]);

    const handleWheel = useCallback((e) => {
        e.preventDefault();

        const zoomSensitivity = 0.001;
        const deltaScale = e.deltaY * -zoomSensitivity;
        const prev = transformRef.current;
        
        const newScale = Math.min(Math.max(0.1, prev.scale + prev.scale * deltaScale), 3);

        if (!containerRef.current) return;

        const rect = containerRef.current.getBoundingClientRect();
        const cursorX = e.clientX - rect.left;
        const cursorY = e.clientY - rect.top;

        const contentCursorX = (cursorX - prev.x) / prev.scale;
        const contentCursorY = (cursorY - prev.y) / prev.scale;

        const newX = cursorX - (contentCursorX * newScale);
        const newY = cursorY - (contentCursorY * newScale);

        transformRef.current = { x: newX, y: newY, scale: newScale };
        applyTransform();
    }, [applyTransform]);

    // Attach native event handler for wheel to prevent default page scrolling
    useLayoutEffect(() => {
        const currentContainer = containerRef.current;
        if (!currentContainer) return;
        const onWheel = (e) => handleWheel(e);
        currentContainer.addEventListener('wheel', onWheel, { passive: false });
        return () => currentContainer.removeEventListener('wheel', onWheel);
    }, [handleWheel]);

    return (
        <div
            ref={containerRef}
            className="tree-canvas-container"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUpOrLeave}
            onMouseLeave={handleMouseUpOrLeave}
            onClickCapture={handleClickCapture}
            style={{
                width: '100%',
                height: '100%',
                overflow: 'hidden',
                position: 'absolute',
                top: 0,
                left: 0,
                backgroundColor: 'var(--bg-primary)',
                cursor: isDragging ? 'grabbing' : 'grab'
            }}
        >
            <div
                ref={worldRef}
                className="tree-canvas-world"
                style={{
                    transformOrigin: '0 0',
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: worldW,
                    height: worldH,
                    pointerEvents: 'auto',
                    willChange: 'transform' // Performance hint
                }}
            >
                <div style={{ position: 'absolute', transform: `translate(${-minX}px, ${-minY}px)` }}>
                    <svg style={{ position: 'absolute', left: 0, top: 0, width: worldW, height: worldH, overflow: 'visible', pointerEvents: 'none' }}>
                        <defs>
                            <pattern id="bgGrid" width="60" height="60" patternUnits="userSpaceOnUse">
                                <path d="M 60 0 L 0 0 0 60" fill="none" stroke="rgba(255, 255, 255, 0.05)" strokeWidth="1" />
                            </pattern>
                        </defs>
                        <rect width="100%" height="100%" fill="url(#bgGrid)" />
                        {connections}
                    </svg>

                    {skillNodes}
                </div>
            </div>

            {/* Reset View Button */}
            <button 
                onClick={(e) => { e.stopPropagation(); centerView(); }}
                title="Zpět na střed"
                style={{
                    position: 'absolute',
                    bottom: '30px',
                    right: '30px',
                    padding: '12px',
                    borderRadius: '50%',
                    background: 'rgba(99, 102, 241, 0.2)',
                    backdropFilter: 'blur(5px)',
                    border: '1px solid rgba(99, 102, 241, 0.4)',
                    color: '#818cf8',
                    cursor: 'pointer',
                    zIndex: 100,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.2s',
                    outline: 'none'
                }}
                onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(99, 102, 241, 0.5)'; e.currentTarget.style.color = '#ffffff'; }}
                onMouseOut={(e) => { e.currentTarget.style.background = 'rgba(99, 102, 241, 0.2)'; e.currentTarget.style.color = '#818cf8'; }}
            >
                <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3"></circle>
                    <path d="M19 12h2M3 12h2M12 3v2M12 19v2M12 5a7 7 0 0 0-7 7 7 7 0 0 0 7 7 7 7 0 0 0 7-7 7 7 0 0 0-7-7z"></path>
                </svg>
            </button>
        </div>
    );
}
