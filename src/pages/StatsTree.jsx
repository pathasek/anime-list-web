import React, { useState, useEffect, useRef, useCallback } from 'react';
import '../tree.css';
import TreeCanvas from '../components/tree/TreeCanvas';
import SkillNode from '../components/tree/SkillNode';
import InteractionPath from '../components/tree/InteractionPath';
import SidePanel from '../components/tree/SidePanel';
import ProfileHUD from '../components/tree/ProfileHUD';
import MilestoneCelebration from '../components/tree/MilestoneCelebration';
import { StatsTreeProvider, useStatsTree } from '../components/tree/StatsTreeContext';

const MILESTONE_STORAGE_KEY = 'anime-tree-node-levels';

function StatsTreeContent() {
    const { nodes, isLoading, error } = useStatsTree();
    const [selectedNode, setSelectedNode] = useState(null);
    const [activeMilestone, setActiveMilestone] = useState(null);
    const [milestoneQueue, setMilestoneQueue] = useState([]);
    const milestoneChecked = useRef(false);

    // Detect milestones by comparing with previously stored state
    useEffect(() => {
        if (!nodes || nodes.length === 0 || milestoneChecked.current) return;
        milestoneChecked.current = true;

        try {
            const stored = localStorage.getItem(MILESTONE_STORAGE_KEY);
            const prevLevels = stored ? JSON.parse(stored) : null;

            // Save current state
            const currentLevels = {};
            nodes.forEach(n => {
                currentLevels[n.id] = n.level;
            });
            localStorage.setItem(MILESTONE_STORAGE_KEY, JSON.stringify(currentLevels));

            // Skip on first visit (no previous data)
            if (!prevLevels) return;

            // Find milestones
            const newMilestones = [];
            nodes.forEach(node => {
                const prevLevel = prevLevels[node.id] || 0;
                const currentLevel = node.level || 0;

                if (currentLevel > prevLevel) {
                    // New unlock (0 → 1+) or max level reached
                    const isMaxLevel = currentLevel >= node.maxLevel;
                    if (prevLevel === 0 && currentLevel >= 1) {
                        newMilestones.push({
                            nodeId: node.id,
                            nodeName: node.label,
                            level: currentLevel,
                            isMaxLevel,
                        });
                    } else if (isMaxLevel && prevLevel < node.maxLevel) {
                        newMilestones.push({
                            nodeId: node.id,
                            nodeName: node.label,
                            level: currentLevel,
                            isMaxLevel: true,
                        });
                    }
                }
            });

            if (newMilestones.length > 0) {
                // Show max-level milestones first
                newMilestones.sort((a, b) => (b.isMaxLevel ? 1 : 0) - (a.isMaxLevel ? 1 : 0));
                setMilestoneQueue(newMilestones);
            }
        } catch {
            // localStorage error, silently skip
        }
    }, [nodes]);

    // Process milestone queue — show one at a time
    useEffect(() => {
        if (milestoneQueue.length > 0 && !activeMilestone) {
            setActiveMilestone(milestoneQueue[0]);
        }
    }, [milestoneQueue, activeMilestone]);

    const handleMilestoneComplete = useCallback(() => {
        setActiveMilestone(null);
        setMilestoneQueue(prev => prev.slice(1));
    }, []);

    if (isLoading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: 'var(--text-muted)' }}>
                Loading 500+ MB of Anime Data...
            </div>
        );
    }

    if (error) {
        return (
            <div style={{ color: 'var(--accent-red)', padding: '2rem' }}>
                Error loading matrix: {error}
            </div>
        );
    }

    // Create lookup for quick position finding
    const nodeLookup = new Map(nodes.map(n => [n.id, n]));

    // Auto-generate paths based on node dependencies
    const paths = [];
    nodes.forEach(node => {
        if (node.dependencies && node.dependencies.length > 0) {
            node.dependencies.forEach(depId => {
                const parent = nodeLookup.get(depId);
                if (parent) {
                    paths.push(
                        <InteractionPath
                            key={`${depId}-${node.id}`}
                            startX={parent.x}
                            startY={parent.y}
                            endX={node.x}
                            endY={node.y}
                            isActive={parent.level >= 1} // Path is powered if parent is at least level 1
                            isMaxed={parent.level >= parent.maxLevel}
                            colorClass={parent.domain || 'primary'}
                        />
                    );
                }
            });
        }
    });

    return (
        <div className="stats-tree-container" style={{ flex: 1, borderRadius: 'var(--radius-lg)', position: 'relative' }}>
            <TreeCanvas
                nodes={nodes}
                connections={paths}
                skillNodes={nodes.map(node => (
                    <SkillNode
                        key={node.id}
                        nodeData={node}
                        onClick={(data) => setSelectedNode(data)}
                        onHover={(data) => { }}
                    />
                ))}
            />

            <ProfileHUD />

            <SidePanel
                nodeData={selectedNode}
                onClose={() => setSelectedNode(null)}
            />

            <MilestoneCelebration
                milestone={activeMilestone}
                onComplete={handleMilestoneComplete}
            />
        </div>
    );
}

export default function StatsTree() {
    return (
        <div className="page-container" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - var(--spacing-xl) * 2)', overflow: 'hidden' }}>
            <StatsTreeProvider>
                <StatsTreeContent />
            </StatsTreeProvider>
        </div>
    );
}

