import React, { useState } from 'react';
import '../tree.css';
import TreeCanvas from '../components/tree/TreeCanvas';
import SkillNode from '../components/tree/SkillNode';
import InteractionPath from '../components/tree/InteractionPath';
import SidePanel from '../components/tree/SidePanel';
import { StatsTreeProvider, useStatsTree } from '../components/tree/StatsTreeContext';

function StatsTreeContent() {
    const { nodes, isLoading, error } = useStatsTree();
    const [selectedNode, setSelectedNode] = useState(null);

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

            <SidePanel
                nodeData={selectedNode}
                onClose={() => setSelectedNode(null)}
            />
        </div>
    );
}

export default function StatsTree() {
    return (
        <div className="page-container" style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
            <StatsTreeProvider>
                <StatsTreeContent />
            </StatsTreeProvider>
        </div>
    );
}
