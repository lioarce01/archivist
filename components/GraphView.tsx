import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as d3 from 'd3';
import { GraphData, GraphNode, GraphLink, UploadedFile } from '../types';
import { buildGraphData } from '../services/graphService';

interface GraphViewProps {
  files: UploadedFile[];
  onDiscuss?: (fileName: string) => void;
}

const GraphView: React.FC<GraphViewProps> = ({ files, onDiscuss }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], links: [] });
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [similarityThreshold, setSimilarityThreshold] = useState(0.65);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  // 1. Build Graph Data when files or threshold changes
  useEffect(() => {
    const data = buildGraphData(files, similarityThreshold);
    setGraphData(data);
  }, [files, similarityThreshold]);

  // 2. Handle Resizing
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight
        });
      }
    };

    window.addEventListener('resize', updateDimensions);
    updateDimensions();

    // Use ResizeObserver for more robust element resizing detection
    const resizeObserver = new ResizeObserver(() => updateDimensions());
    if (containerRef.current) resizeObserver.observe(containerRef.current);

    return () => {
      window.removeEventListener('resize', updateDimensions);
      resizeObserver.disconnect();
    };
  }, []);

  // 3. D3 Rendering Logic
  useEffect(() => {
    if (!graphData.nodes.length || dimensions.width === 0 || dimensions.height === 0) return;

    // Clear previous SVG content to prevent duplication
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    // Setup SVG
    svg
      .attr("width", dimensions.width)
      .attr("height", dimensions.height)
      .attr("viewBox", [0, 0, dimensions.width, dimensions.height])
      .style("cursor", "grab");

    // --- VISUAL DEFINITIONS (Gradients & Filters) ---
    const defs = svg.append("defs");

    // 1. Standard Node Gradient (Vintage Brown)
    // Used for normal nodes (val <= 2)
    const gradStandard = defs.append("radialGradient")
        .attr("id", "node-standard")
        .attr("cx", "30%")
        .attr("cy", "30%")
        .attr("r", "70%");
    gradStandard.append("stop").attr("offset", "0%").style("stop-color", "#5c4b37"); // highlight (paper-600)
    gradStandard.append("stop").attr("offset", "100%").style("stop-color", "#2b2118"); // base (paper-800)

    // 2. Heavy Node Gradient (Darker)
    // Used for highly connected nodes (val > 2)
    const gradHeavy = defs.append("radialGradient")
        .attr("id", "node-heavy")
        .attr("cx", "30%")
        .attr("cy", "30%")
        .attr("r", "70%");
    gradHeavy.append("stop").attr("offset", "0%").style("stop-color", "#3d3226");
    gradHeavy.append("stop").attr("offset", "100%").style("stop-color", "#0f0c0a"); // almost black

    // 3. Selected/Hover Gradient (Glowing Red Ink)
    const gradSelected = defs.append("radialGradient")
        .attr("id", "node-selected")
        .attr("cx", "30%")
        .attr("cy", "30%")
        .attr("r", "80%");
    gradSelected.append("stop").attr("offset", "0%").style("stop-color", "#d45d5d"); // bright red
    gradSelected.append("stop").attr("offset", "100%").style("stop-color", "#8a2c2c"); // ink red

    // 4. Glow Filter
    const filter = defs.append("filter")
        .attr("id", "glow")
        .attr("x", "-50%")
        .attr("y", "-50%")
        .attr("width", "200%")
        .attr("height", "200%");
    filter.append("feGaussianBlur")
        .attr("stdDeviation", "2")
        .attr("result", "coloredBlur");
    const feMerge = filter.append("feMerge");
    feMerge.append("feMergeNode").attr("in", "coloredBlur");
    feMerge.append("feMergeNode").attr("in", "SourceGraphic");
    // ------------------------------------------------

    // Group for Zooming
    const g = svg.append("g");

    // Zoom Behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 8])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
      });

    svg.call(zoom);

    // Force Simulation
    const simulationNodes = graphData.nodes.map(d => ({...d}));
    const simulationLinks = graphData.links.map(d => ({...d}));

    const simulation = d3.forceSimulation<GraphNode>(simulationNodes)
      .force("link", d3.forceLink<GraphNode, GraphLink>(simulationLinks).id(d => d.id).distance(150))
      .force("charge", d3.forceManyBody().strength(-500)) 
      .force("center", d3.forceCenter(dimensions.width / 2, dimensions.height / 2))
      .force("collide", d3.forceCollide(d => (d.val * 4) + 25).iterations(2));

    // Render Links
    const link = g.append("g")
      .attr("stroke", "#d6cba6") // paper-400
      .attr("stroke-opacity", 0.6)
      .selectAll("line")
      .data(simulationLinks)
      .join("line")
      .attr("stroke-width", d => Math.max(1, Math.sqrt(d.value * 5)))
      .attr("class", "link");

    // Render Nodes Group
    const nodeGroup = g.append("g")
      .selectAll("g")
      .data(simulationNodes)
      .join("g")
      .attr("class", "node-group")
      .call(d3.drag<SVGGElement, GraphNode>()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended));

    // Node Circles
    nodeGroup.append("circle")
      .attr("r", d => {
         const baseR = 8 + (d.val * 3);
         // Increase size if selected
         return (selectedNode && d.id === selectedNode.id) ? baseR * 1.2 : baseR;
      }) 
      .attr("fill", d => {
        if (selectedNode && d.id === selectedNode.id) return "url(#node-selected)";
        return d.val > 2 ? "url(#node-heavy)" : "url(#node-standard)";
      }) 
      .attr("stroke", "#efeadd") 
      .attr("stroke-width", 2)
      // Apply glow filter if selected, else simple shadow
      .style("filter", d => (selectedNode && d.id === selectedNode.id) ? "url(#glow)" : "drop-shadow(2px 4px 6px rgba(0,0,0,0.15))")
      .style("cursor", "pointer")
      .attr("class", "node-circle")
      .on("click", (event, d) => {
        event.stopPropagation();
        setSelectedNode(d);
      });

    // Node Labels (Background Halo)
    nodeGroup.append("text")
      .attr("dx", d => 14 + (d.val * 3))
      .attr("dy", ".35em")
      .text(d => {
         const t = d.metadata?.title && d.metadata.title !== "Unknown" ? d.metadata.title : d.name;
         return t.length > 30 ? t.substring(0,30) + '...' : t;
      })
      .attr("font-family", "serif")
      .attr("font-size", "12px")
      .attr("font-weight", "bold")
      .attr("stroke", "#efeadd")
      .attr("stroke-width", 3)
      .attr("opacity", 0.8)
      .style("pointer-events", "none");

    // Node Labels (Text)
    nodeGroup.append("text")
      .attr("dx", d => 14 + (d.val * 3))
      .attr("dy", ".35em")
      .text(d => {
         const t = d.metadata?.title && d.metadata.title !== "Unknown" ? d.metadata.title : d.name;
         return t.length > 30 ? t.substring(0,30) + '...' : t;
      })
      .attr("font-family", "serif")
      .attr("font-size", "12px")
      .attr("font-weight", "bold")
      .attr("fill", "#120f0c")
      .style("pointer-events", "none");

    // Simulation Tick
    simulation.on("tick", () => {
      link
        .attr("x1", d => (d.source as GraphNode).x!)
        .attr("y1", d => (d.source as GraphNode).y!)
        .attr("x2", d => (d.target as GraphNode).x!)
        .attr("y2", d => (d.target as GraphNode).y!);

      nodeGroup
        .attr("transform", d => `translate(${d.x},${d.y})`);
    });

    // Hover Interactions
    nodeGroup.on("mouseover", function(event, d) {
        const circle = d3.select(this).select("circle");
        
        // 1. Highlight Node
        // Animate size increase and apply glow gradient/filter
        circle.transition().duration(200)
             .attr("r", (8 + (d.val * 3)) * 1.25)
             .attr("stroke", "#fff");

        circle.attr("fill", "url(#node-selected)")
              .style("filter", "url(#glow)");
        
        // 2. Highlight Connections
        const connectedIds = new Set([d.id]);
        
        link.attr("stroke", l => {
            if ((l.source as GraphNode).id === d.id || (l.target as GraphNode).id === d.id) {
                connectedIds.add((l.source as GraphNode).id);
                connectedIds.add((l.target as GraphNode).id);
                return "#8a2c2c";
            }
            return "#d6cba6";
        }).attr("stroke-opacity", l => {
            if ((l.source as GraphNode).id === d.id || (l.target as GraphNode).id === d.id) return 1;
            return 0.1;
        });

        // Dim unconnected nodes
        nodeGroup.transition().duration(200).attr("opacity", n => connectedIds.has(n.id) ? 1 : 0.2);
    })
    .on("mouseout", function(event, d) {
        const circle = d3.select(this).select("circle");
        const isSelected = selectedNode && selectedNode.id === d.id;
        const baseR = 8 + (d.val * 3);

        // Reset Node
        circle.transition().duration(200)
            .attr("r", isSelected ? baseR * 1.2 : baseR)
            .attr("stroke", "#efeadd");

        if (!isSelected) {
            circle.attr("fill", d.val > 2 ? "url(#node-heavy)" : "url(#node-standard)")
                  .style("filter", "drop-shadow(2px 4px 6px rgba(0,0,0,0.15))");
        }
        
        // Reset Links
        link.attr("stroke", "#d6cba6").attr("stroke-opacity", 0.6);
        nodeGroup.transition().duration(200).attr("opacity", 1);
    });

    // Drag Handlers
    function dragstarted(event: d3.D3DragEvent<SVGGElement, GraphNode, unknown>, d: GraphNode) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
      svg.style("cursor", "grabbing");
    }

    function dragged(event: d3.D3DragEvent<SVGGElement, GraphNode, unknown>, d: GraphNode) {
      d.fx = event.x;
      d.fy = event.y;
    }

    function dragended(event: d3.D3DragEvent<SVGGElement, GraphNode, unknown>, d: GraphNode) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
      svg.style("cursor", "grab");
    }

    return () => {
      simulation.stop();
    };
  }, [graphData, dimensions, selectedNode]);

  const handleExportJson = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(graphData, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "literature_graph.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const handleReset = () => {
      setSimilarityThreshold(0.65);
      setSelectedNode(null);
  };

  return (
    <div className="w-full h-full relative bg-[#fdfbf7] overflow-hidden">
      {/* Grid Background */}
      <div className="absolute inset-0 z-0 opacity-20 pointer-events-none" 
        style={{ 
          backgroundImage: 'linear-gradient(#d6cba6 1px, transparent 1px), linear-gradient(90deg, #d6cba6 1px, transparent 1px)', 
          backgroundSize: '40px 40px' 
        }}>
      </div>

      {/* Main Container for Resize Observer */}
      <div ref={containerRef} className="w-full h-full z-10 relative">
         <svg ref={svgRef} className="w-full h-full block"></svg>
      </div>

      {/* Empty State */}
      {graphData.nodes.length === 0 && (
         <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
             <div className="bg-paper-200/90 p-8 rounded border border-paper-400 text-center shadow-lg backdrop-blur-sm">
                 <h3 className="text-xl font-display font-bold text-paper-900 mb-2">Map Empty</h3>
                 <p className="text-sm font-mono text-paper-600">Upload documents to generate the semantic graph.</p>
             </div>
         </div>
      )}

      {/* Controls Overlay */}
      <div className="absolute top-4 left-4 z-20 bg-paper-100/95 backdrop-blur-sm p-4 rounded-sm border border-paper-400 shadow-md w-64 transition-opacity duration-300 hover:opacity-100 opacity-90">
        <h3 className="text-sm font-display font-bold text-paper-900 mb-2 border-b border-paper-300 pb-1 flex justify-between items-center">
            Map Controls
            <button onClick={handleReset} className="text-[10px] text-ink-blue hover:underline font-mono uppercase">Reset</button>
        </h3>
        
        <div className="mb-4">
          <label className="text-[10px] font-mono uppercase font-bold text-paper-600 block mb-1">
            Similarity Threshold: {similarityThreshold.toFixed(2)}
          </label>
          <input 
            type="range" 
            min="0.1" 
            max="0.95" 
            step="0.05" 
            value={similarityThreshold}
            onChange={(e) => setSimilarityThreshold(parseFloat(e.target.value))}
            className="w-full h-1 bg-paper-300 rounded-lg appearance-none cursor-pointer accent-ink-blue"
          />
          <div className="flex justify-between text-[8px] font-mono text-paper-400 mt-1">
             <span>Loose</span>
             <span>Strict</span>
          </div>
        </div>

        <div className="flex justify-between items-center text-[10px] font-mono text-paper-500 italic">
          <span>{graphData.nodes.length} nodes / {graphData.links.length} links</span>
        </div>
        
        <p className="text-[10px] text-paper-400 mt-2 italic">
            * Scroll to Zoom, Drag to Pan. Nodes size = connectivity.
        </p>

        <button 
          onClick={handleExportJson}
          className="mt-4 w-full py-2 bg-paper-200 border border-paper-400 text-xs font-mono font-bold text-paper-800 hover:bg-white transition-colors flex items-center justify-center gap-2"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
          Export Data (JSON)
        </button>
      </div>

      {/* Node Details Sidebar (Right) */}
      {selectedNode && (
        <div className="absolute top-0 right-0 h-full w-80 bg-paper-200 border-l border-paper-400 shadow-xl z-30 p-6 overflow-y-auto animate-slide-in-right">
           <button 
             onClick={() => setSelectedNode(null)}
             className="absolute top-4 right-4 text-paper-500 hover:text-ink-red transition-colors"
           >
             <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
           </button>

           <div className="mt-4">
              <span className="inline-block px-2 py-0.5 bg-paper-800 text-paper-50 text-[10px] font-mono uppercase tracking-widest mb-2">Selected Node</span>
              <h2 className="text-xl font-display font-bold text-paper-900 leading-tight mb-2">
                {selectedNode.metadata?.title && selectedNode.metadata.title !== "Unknown" ? selectedNode.metadata.title : selectedNode.name}
              </h2>
              
              <div className="text-sm font-serif text-paper-600 mb-6 italic border-b border-paper-400 pb-4">
                By {selectedNode.metadata?.authors?.length ? selectedNode.metadata.authors.join(', ') : "Unknown Author(s)"} ({selectedNode.metadata?.year || "n.d."})
              </div>

              {selectedNode.metadata?.topics && selectedNode.metadata.topics.length > 0 && (
                <div className="mb-6">
                  <h4 className="text-[10px] font-mono font-bold text-paper-500 uppercase tracking-widest mb-2">Keywords</h4>
                  <div className="flex flex-wrap gap-2">
                    {selectedNode.metadata.topics.map((t, i) => (
                      <span key={i} className="px-2 py-1 bg-paper-300 text-paper-800 text-xs rounded-sm border border-paper-400">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="mb-6">
                <h4 className="text-[10px] font-mono font-bold text-paper-500 uppercase tracking-widest mb-2">Abstract / Summary</h4>
                <div className="p-3 bg-paper-100 border-l-2 border-ink-blue text-sm leading-relaxed text-paper-900">
                  {selectedNode.metadata?.summary || "No summary available."}
                </div>
              </div>

              {onDiscuss && (
                 <button 
                   onClick={() => onDiscuss(selectedNode.name)}
                   className="w-full mb-6 py-2 bg-ink-blue text-paper-50 font-bold font-mono text-xs uppercase tracking-widest rounded-sm shadow-sm hover:bg-paper-900 transition-colors flex items-center justify-center gap-2"
                 >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
                    Discuss in Chat
                 </button>
              )}

              <div className="mt-8 pt-4 border-t border-dashed border-paper-400 opacity-50">
                 <p className="text-[10px] font-mono text-paper-600 truncate">File ID: {selectedNode.fileId}</p>
                 <p className="text-[10px] font-mono text-paper-600">Connectivity: {selectedNode.val - 1} Links</p>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default GraphView;