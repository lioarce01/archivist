import { UploadedFile, GraphData, GraphNode, GraphLink } from '../types';

// Helper to calculate cosine similarity between two vectors
const cosineSimilarity = (vecA: number[], vecB: number[]): number => {
  const dotProduct = vecA.reduce((acc, val, i) => acc + val * vecB[i], 0);
  const magA = Math.sqrt(vecA.reduce((acc, val) => acc + val * val, 0));
  const magB = Math.sqrt(vecB.reduce((acc, val) => acc + val * val, 0));
  
  // Prevent division by zero if an embedding is empty or zero-vector
  if (magA === 0 || magB === 0) return 0;
  
  return dotProduct / (magA * magB);
};

export const buildGraphData = (files: UploadedFile[], similarityThreshold: number = 0.65): GraphData => {
  const nodes: GraphNode[] = [];
  const links: GraphLink[] = [];

  // 1. Create Nodes - Filter only processed files with embeddings or at least extracted text
  files.forEach(file => {
    if (file.processed) {
      nodes.push({
        id: file.id,
        fileId: file.id,
        name: file.name,
        metadata: file.metadata,
        val: 1, // Default value (base size), will be updated based on connections
        x: 0, // Initial positions (optional, D3 handles this)
        y: 0,
      });
    }
  });

  // 2. Create Links based on similarity
  // O(N^2) complexity, acceptable for <100 documents in prototype
  for (let i = 0; i < files.length; i++) {
    for (let j = i + 1; j < files.length; j++) {
      const fileA = files[i];
      const fileB = files[j];

      // Only compare if both have valid embeddings
      if (fileA.embedding && fileB.embedding && fileA.embedding.length > 0 && fileB.embedding.length > 0) {
        const similarity = cosineSimilarity(fileA.embedding, fileB.embedding);
        
        if (similarity > similarityThreshold) {
          links.push({
            source: fileA.id,
            target: fileB.id,
            value: similarity,
          });
        }
      }
    }
  }

  // 3. Calculate Degree Centrality (Connection Count) for visual sizing
  const degreeCounts: Record<string, number> = {};
  links.forEach(link => {
    // link.source and link.target are strings (IDs) here before D3 simulation processing
    const s = link.source as string;
    const t = link.target as string;
    degreeCounts[s] = (degreeCounts[s] || 0) + 1;
    degreeCounts[t] = (degreeCounts[t] || 0) + 1;
  });

  // Update node values based on connections + 1 (base size)
  nodes.forEach(node => {
    node.val = (degreeCounts[node.id] || 0) + 1;
  });

  return { nodes, links };
};