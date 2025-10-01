// lib/rag/schema.ts

export type ChunkMeta = {
  file: string;
  page?: number;
  lines?: [number, number];
  // allow extra metadata keys if needed
  [k: string]: unknown;
};

export type Chunk = {
  id: string;
  text: string;
  meta: ChunkMeta;
  embedding: number[]; // all vectors must share identical length
};

export type KBFile = Chunk[];