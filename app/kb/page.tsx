'use client';

import React, { useState, useEffect } from 'react';

interface Document {
  path: string;
  category: string;
  filename: string;
  displayName: string;
}

export default function KnowledgeBasePage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [embeddedCount, setEmbeddedCount] = useState(0);

  useEffect(() => {
    // Load KB index from the API
    fetch(`/api/kb/documents?ts=${Date.now()}`, { cache: 'no-store', headers: { 'cache-control': 'no-store' } })
      .then(res => res.json())
      .then(async data => {
        if (data.ok && data.documents) {
          const processedDocs = data.documents.map((path: string) => {
            const parts = path.split('/');
            const filename = parts[parts.length - 1];
            const category = parts.length > 1 ? parts[0] : 'Other';
            const displayName = filename.replace(/\.pdf$/, '').replace(/\.txt$/, '');

            return {
              path,
              category,
              filename,
              displayName
            };
          });
          setDocuments(processedDocs);

          // Fetch embeddings to compute coverage badge (embedded vs total)
          try {
            const embRes = await fetch(`/embeddings.json?ts=${Date.now()}`, { cache: 'no-store', headers: { 'cache-control': 'no-store' } });
            if (embRes.ok) {
              const embData = await embRes.json();
              const embeddedFiles: Set<string> = new Set(
                Array.isArray(embData.items) ? embData.items.map((it: any) => String(it.file || '')) : []
              );
              const count = processedDocs.reduce((acc: number, doc: Document) => {
                const candidates = [
                  doc.path,
                  doc.path.replace(/\.pdf$/i, '.txt'),
                  doc.path.replace(/\.txt$/i, '.pdf')
                ];
                const covered = candidates.some((c) => embeddedFiles.has(c));
                return covered ? acc + 1 : acc;
              }, 0);
              setEmbeddedCount(count);
            }
          } catch (_e) {
            // ignore coverage badge errors
          }
        }
      })
      .catch(err => {
        console.error('Error loading KB documents:', err);
        // Fallback: load from static data
        const staticDocs = [
          "Materiales Extranjeria/Criterios de gestión/25-06-10 Criterio derogacion inversores.pdf",
          "Materiales Extranjeria/Criterios de gestión/25-06-23 Criterio legitimacion empresas.pdf",
          "Materiales Extranjeria/FAQs/FAQ-Guia-Arraigo.pdf",
          "Materiales Extranjeria/FAQs/FAQ-Guia-Estudiantes.pdf",
          "Materiales Extranjeria/Hojas informativas/1. Estancia estudios superiores - educación secundaria postobligatoria.pdf",
          "Materiales Extranjeria/Instrucciones/2025-01-13 Instrucción pasaportes venezolanos.pdf",
          "Materiales Extranjeria/Modelos EX/EX17. Formulario solicitud Tarjeta de Identidad de Extranjero. Editable.pdf",
          "Materiales Extranjeria/Normativa/BOE-A-2000-544 LOEx.pdf"
        ];
        
        const processedDocs = staticDocs.map((path: string) => {
          const parts = path.split('/');
          const filename = parts[parts.length - 1];
          const category = parts.length > 1 ? parts[0] : 'Other';
          const displayName = filename.replace(/\.pdf$/, '').replace(/\.txt$/, '');
          
          return {
            path,
            category,
            filename,
            displayName
          };
        });
        setDocuments(processedDocs);
      })
      .finally(() => setLoading(false));
  }, []);

  // Get unique categories
  const categories = ['all', ...Array.from(new Set(documents.map(doc => doc.category)))];

  // Filter documents
  const filteredDocs = documents.filter(doc => {
    const matchesSearch = doc.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         doc.filename.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || doc.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  // Group documents by category for display
  const groupedDocs = filteredDocs.reduce((acc, doc) => {
    if (!acc[doc.category]) {
      acc[doc.category] = [];
    }
    acc[doc.category].push(doc);
    return acc;
  }, {} as Record<string, Document[]>);

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center" style={{ fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Inter, sans-serif' }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-gray-300 border-t-gray-600 mx-auto mb-6"></div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">Cargando documentos</h3>
          <p className="text-gray-500">Preparando base de conocimiento...</p>
        </div>
      </div>
    );
  }

  return (
    <div 
      className="min-h-screen bg-white" 
      style={{ 
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Inter, sans-serif',
        padding: 0,
        margin: 0
      }}
    >
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div style={{ 
          maxWidth: 1152, 
          margin: '0 auto', 
          padding: '24px 32px',
          boxSizing: 'border-box'
        }}>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900 mb-2">
                Base de Conocimiento
              </h1>
              <p className="text-gray-600 mb-3">
                Documentos de Inmigración a España
              </p>
              <div className="text-sm text-gray-500" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>{documents.length} documentos totales</span>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                  {embeddedCount} con embeddings
                </span>
              </div>
            </div>
            <a 
              href="/"
              className="px-4 py-2 bg-gray-900 text-white rounded-md hover:bg-gray-800 transition-colors font-medium"
            >
              Volver al Chat
            </a>
          </div>
        </div>
      </header>

      {/* Filters */}
      <div className="bg-gray-50 border-b border-gray-200">
        <div style={{ 
          maxWidth: 1152, 
          margin: '0 auto', 
          padding: '24px 32px',
          boxSizing: 'border-box'
        }}>
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Search */}
            <div className="flex-1">
              <input
                type="text"
                placeholder="Buscar documentos..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-gray-500 focus:border-transparent bg-white text-gray-900 placeholder-gray-500"
              />
            </div>
            
            {/* Category Filter */}
            <div className="sm:w-64">
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-gray-500 focus:border-transparent bg-white text-gray-900"
              >
                {categories.map(category => (
                  <option key={category} value={category}>
                    {category === 'all' ? 'Todas las categorías' : category}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <main style={{ 
        maxWidth: 1152, 
        margin: '0 auto', 
        padding: '32px',
        boxSizing: 'border-box'
      }}>
        {filteredDocs.length === 0 ? (
          <div className="text-center py-16">
            <h3 className="text-lg font-medium text-gray-900 mb-2">No se encontraron documentos</h3>
            <p className="text-gray-600 mb-6">Intenta ajustar los filtros de búsqueda</p>
            <button 
              onClick={() => { setSearchTerm(''); setSelectedCategory('all'); }}
              className="px-4 py-2 bg-gray-900 text-white rounded-md hover:bg-gray-800 transition-colors font-medium"
            >
              Limpiar filtros
            </button>
          </div>
        ) : (
          <div className="space-y-8">
            {Object.entries(groupedDocs).map(([category, docs]) => (
              <div key={category} className="bg-white border border-gray-200 rounded-lg">
                <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-medium text-gray-900">
                      {category}
                    </h2>
                    <span className="text-sm text-gray-500">
                      {docs.length} documento{docs.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
                <div className="divide-y divide-gray-200">
                  {docs.map((doc, index) => (
                    <div key={`${doc.path}-${index}`} className="px-6 py-4 hover:bg-gray-50 transition-colors">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="font-medium text-gray-900 mb-1">
                            {doc.displayName}
                          </h3>
                          <p className="text-sm text-gray-500 font-mono">
                            {doc.path}
                          </p>
                        </div>
                        <div className="ml-4">
                          <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-800">
                            PDF
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-gray-50 border-t border-gray-200 mt-16">
        <div style={{ 
          maxWidth: 1152, 
          margin: '0 auto', 
          padding: '24px 32px',
          boxSizing: 'border-box'
        }}>
          <div className="text-center">
            <h3 className="text-lg font-medium text-gray-900 mb-2">Olivo Galarza Abogados</h3>
            <p className="text-gray-600 mb-1">Base de Conocimiento Especializada</p>
            <p className="text-sm text-gray-500">
              Documentación oficial de Inmigración a España • Actualizada 2025
            </p>
            <div className="mt-4 pt-4 border-t border-gray-200">
              <p className="text-xs text-gray-400">
                Esta base de conocimiento contiene documentos oficiales del Ministerio de Inclusión, Seguridad Social y Migraciones
              </p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
