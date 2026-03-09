import React, { useRef, useState, useEffect } from 'react';

/**
 * TreeCanvas implements an infinite draggable/zoomable canvas.
 */
export default function TreeCanvas({ children, width = '100%', height = 'calc(100vh - 80px)' }) {
    const containerRef = useRef(null);

    // Transform state: position (x, y) and zoom (scale)
    const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

    // Handle zooming via scroll wheel
    const handleWheel = (e) => {
        // Prevent default scroll behavior
        e.preventDefault();

        const zoomSensitivity = 0.001;
        const delta = -e.deltaY * zoomSensitivity;

        setTransform(prev => {
            let newScale = prev.scale + delta;
            // Clamp zoom between 0.1 and 3
            newScale = Math.min(Math.max(0.1, newScale), 3);

            // Calculate cursor position relative to container
            const rect = containerRef.current.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            // Calculate how much the scale changed
            const scaleChange = newScale - prev.scale;

            // Shift the (x,y) so that we zoom "into" the cursor
            // This logic might need tweaking for perfect UX, but works as a baseline
            const newX = prev.x - (mouseX - prev.x) * (scaleChange / prev.scale);
            const newY = prev.y - (mouseY - prev.y) * (scaleChange / prev.scale);

            return { x: newX, y: newY, scale: newScale };
        });
    };

    // Dragging logic
    const handlePointerDown = (e) => {
        if (e.button !== 0) return; // Only left click grabs
        setIsDragging(true);
        setDragStart({ x: e.clientX, y: e.clientY });

        if (containerRef.current) {
            containerRef.current.setPointerCapture(e.pointerId);
        }
    };

    const handlePointerMove = (e) => {
        if (!isDragging) return;

        const dx = e.clientX - dragStart.x;
        const dy = e.clientY - dragStart.y;

        setTransform(prev => ({
            ...prev,
            x: prev.x + dx,
            y: prev.y + dy
        }));

        setDragStart({ x: e.clientX, y: e.clientY });
    };

    const handlePointerUp = (e) => {
        setIsDragging(false);
        if (containerRef.current && containerRef.current.hasPointerCapture(e.pointerId)) {
            containerRef.current.releasePointerCapture(e.pointerId);
        }
    };

    // Need a global passive event listener for wheel to prevent default body scrolling
    useEffect(() => {
        const element = containerRef.current;
        if (element) {
            element.addEventListener('wheel', handleWheel, { passive: false });
            // Prevent generic context menu on right click maybe, or dragging images
            return () => {
                element.removeEventListener('wheel', handleWheel);
            }
        }
    }, []);

    return (
        <div
            ref={containerRef}
            className={`tree-canvas-container ${isDragging ? 'dragging' : ''}`}
            style={{ width, height, overflow: 'hidden', position: 'relative', cursor: isDragging ? 'grabbing' : 'grab' }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onPointerLeave={handlePointerUp}
        >
            {/* 
        The world wrapper translates and scales based on state.
        All nodes and SVG lines inside this will move together.
      */}
            <div
                className="tree-canvas-world"
                style={{
                    transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
                    transformOrigin: '0 0',
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: 0,
                    height: 0,
                    willChange: 'transform' // performance optimization
                }}
            >
                {children}
            </div>

            {/* Minimap or Recenter UI could go here (outside the scaled world) */}
            <button
                className="recenter-btn fade-in"
                onClick={() => setTransform({ x: 0, y: 0, scale: 1 })}
            >
                Origin
            </button>
        </div>
    );
}
