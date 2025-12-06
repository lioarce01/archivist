
export enum FileType {
  PDF = 'application/pdf',
  PNG = 'image/png',
  JPEG = 'image/jpeg',
  WEBP = 'image/webp',
  TXT = 'text/plain',
  CSV = 'text/csv'
}

export interface DocumentMetadata {
  title?: string;
  authors?: string[];
  year?: string;
  topics?: string[];
  summary?: string;
}

export interface UploadedFile {
  id: string;
  name: string;
  type: string;
  size: number;
  content: string; // Base64 or text content
  processed: boolean;
  processingError?: string;
  extractedText?: string;
  metadata?: DocumentMetadata;
  embedding?: number[]; // Vector representation of the whole document
}

export interface SearchResult {
  fileId: string;
  fileName: string;
  similarity: number;
  textSnippet: string;
}

export interface GroundingChunk {
  web?: {
    uri: string;
    title: string;
  };
}

export interface GroundingMetadata {
  groundingChunks?: GroundingChunk[];
  groundingSupports?: any[];
  webSearchQueries?: string[];
}

export interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
  references?: SearchResult[];
  isThinking?: boolean;
  groundingMetadata?: GroundingMetadata;
  audioData?: string; // Base64 encoded raw PCM
  audioScript?: string;
}

export interface VectorRecord {
  id: string;
  fileId: string;
  fileName: string;
  text: string;
  embedding: number[];
}

// Graph Types
export interface GraphNode {
  id: string;
  fileId: string;
  name: string;
  metadata?: DocumentMetadata;
  val: number; // For visual size
  // d3 Simulation properties
  index?: number;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
}

export interface GraphLink {
  source: string | GraphNode;
  target: string | GraphNode;
  value: number; // Similarity score
  // d3 Simulation properties
  index?: number;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}