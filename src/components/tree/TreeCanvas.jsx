import React, { useMemo, useRef, useState, useLayoutEffect, useCallback } from 'react';

/**
 * TreeCanvas implements an infinite pan and zoom canvas.
 */
export default function TreeCanvas({ connections, skillNodes, nodes = [] }) {
    const containerRef = useRef(null);
    const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
    const [isDragging, setIsDragging] = useState(false);
    const [hasDragged, setHasDragged] = useState(false);
    const dragStart = useRef({ x: 0, y: 0 });

    const { minX, minY, worldW, worldH } = useMemo(() => {
        if (!nodes || nodes.length === 0) return { minX: 0, minY: 0, worldW: '100%', worldH: '100%' };

        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        const NODE_W = 160;
        const NODE_H = 68;

        nodes.forEach(n => {
            if (n.x < minX) minX = n.x;
            if (n.x > maxX) maxX = n.x;
            if (n.y < minY) minY = n.y;
            if (n.y > maxY) maxY = n.y;
        });

        const PADDING_X = 300;
        const PADDING_Y = 300;

        return {
            minX: minX - PADDING_X,
            minY: minY - PADDING_Y,
            worldW: (maxX - minX) + NODE_W + PADDING_X * 2,
            worldH: (maxY - minY) + NODE_H + PADDING_Y * 2
        };
    }, [nodes]);

    // Auto-scroll to center (the root node) on first load
    useLayoutEffect(() => {
        if (containerRef.current && nodes.length > 0) {
            const root = nodes.find(n => n.id === 'singularity') || nodes[0];
            if (root) {
                // Determine ideal initial transform so the root node is centered
                const containerW = containerRef.current.clientWidth;
                const containerH = containerRef.current.clientHeight;

                // Content coordinates of the root node
                const contentX = root.x - minX + 80; // center of node
                const contentY = root.y - minY + 34; // center of node

                const initialScale = 1;
                const offsetX = (containerW / 2) - (contentX * initialScale);
                const offsetY = (containerH / 2) - (contentY * initialScale);

                setTransform({ x: offsetX, y: offsetY, scale: initialScale });
            }
        }
    }, [minX, minY, nodes]);

    // Interaction Handlers
    const handleMouseDown = useCallback((e) => {
        // Only trigger on left or middle click, ignore right clicks
        if (e.button !== 0 && e.button !== 1) return;

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
            setHasDragged(true);
        }

        setTransform(prev => ({
            ...prev,
            x: prev.x + dx,
            y: prev.y + dy
        }));

        dragStart.current = { x: e.clientX, y: e.clientY };
    }, [isDragging]);

    const handleMouseUpOrLeave = useCallback(() => {
        setIsDragging(false);
        // Do not reset hasDragged here so clickCapture can use it
    }, []);

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

        setTransform(prev => {
            const newScale = Math.min(Math.max(0.1, prev.scale + prev.scale * deltaScale), 3);

            // To zoom towards cursor:
            // The point on the content under the cursor shouldn't change its screen coordinate
            if (!containerRef.current) return prev;

            const rect = containerRef.current.getBoundingClientRect();
            // Cursor position relative to the container
            const cursorX = e.clientX - rect.left;
            const cursorY = e.clientY - rect.top;

            // Cursor position relative to the content (unscaled)
            const contentCursorX = (cursorX - prev.x) / prev.scale;
            const contentCursorY = (cursorY - prev.y) / prev.scale;

            // New transform positions to lock the cursor to its content coordinate
            const newX = cursorX - (contentCursorX * newScale);
            const newY = cursorY - (contentCursorY * newScale);

            return { x: newX, y: newY, scale: newScale };
        });
    }, []);

    // Because React onWheel passive limitations, attach native event handler for wheel to prevent default page scrolling
    useLayoutEffect(() => {
        const currentContainer = containerRef.current;
        if (!currentContainer) return;

        const onWheel = (e) => handleWheel(e);
        currentContainer.addEventListener('wheel', onWheel, { passive: false });

        return () => {
            currentContainer.removeEventListener('wheel', onWheel);
        };
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
                overflow: 'hidden', // Disable native scrolling
                position: 'absolute',
                top: 0,
                left: 0,
                backgroundColor: 'var(--bg-primary)',
                cursor: isDragging ? 'grabbing' : 'grab'
            }}
        >
            <div
                className="tree-canvas-world"
                style={{
                    transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
                    transformOrigin: '0 0',
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: worldW,
                    height: worldH,
                    pointerEvents: 'auto', // Always allow events, clickCapture intercepts if dragging 
                    transition: isDragging ? 'none' : 'transform 0.1s ease-out' // Smooth zoom
                }}
            >
                <div style={{ position: 'absolute', transform: `translate(${-minX}px, ${-minY}px)` }}>
                    <svg style={{ position: 'absolute', left: 0, top: 0, width: worldW, height: worldH, overflow: 'visible', pointerEvents: 'none' }}>
                        {connections}
                    </svg>

                    {skillNodes}
                </div>
            </div>
        </div>
    );
}
