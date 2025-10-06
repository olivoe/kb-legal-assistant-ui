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

  useEffect(() => {
    // Load KB index from the API
    fetch('/api/kb/documents')
      .then(res => res.json())
      .then(data => {
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
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex items-center justify-center" style={{ fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-r from-blue-100 to-indigo-100 rounded-2xl mb-6">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent"></div>
          </div>
          <h3 className="text-xl font-semibold text-slate-900 mb-2">Cargando Base de Conocimiento</h3>
          <p className="text-slate-600">Preparando documentos de inmigración...</p>
          <div className="mt-4 flex items-center justify-center space-x-1">
            <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce"></div>
            <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
            <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50" style={{ fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md shadow-lg border-b border-white/20 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                Base de Conocimiento
              </h1>
              <p className="text-slate-600 mt-2 text-lg font-medium">
                Documentos de Inmigración a España
              </p>
              <div className="flex items-center mt-2 space-x-4">
                <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold bg-blue-100 text-blue-800">
                  {documents.length} documentos
                </span>
                <span className="text-slate-500 text-sm">Actualizado 2025</span>
              </div>
            </div>
            <a 
              href="/"
              className="group bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-6 py-3 rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 font-semibold"
            >
              <span className="flex items-center space-x-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                <span>Volver al Chat</span>
              </span>
            </a>
          </div>
        </div>
      </header>

      {/* Filters */}
      <div className="bg-white/60 backdrop-blur-sm border-b border-white/20">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex flex-col lg:flex-row gap-6">
            {/* Search */}
            <div className="flex-1">
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg className="h-5 w-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <input
                  type="text"
                  placeholder="Buscar documentos, procedimientos, requisitos..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-white/80 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white transition-all duration-200 shadow-sm hover:shadow-md text-slate-700 placeholder-slate-400 font-medium"
                />
              </div>
            </div>
            
            {/* Category Filter */}
            <div className="lg:w-80">
              <div className="relative">
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full px-4 py-3 bg-white/80 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white transition-all duration-200 shadow-sm hover:shadow-md text-slate-700 font-medium appearance-none cursor-pointer"
                >
                  {categories.map(category => (
                    <option key={category} value={category}>
                      {category === 'all' ? '📚 Todas las categorías' : `📁 ${category}`}
                    </option>
                  ))}
                </select>
                <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                  <svg className="h-5 w-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {filteredDocs.length === 0 ? (
          <div className="text-center py-16">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-r from-blue-100 to-indigo-100 rounded-2xl mb-6">
              <svg className="w-10 h-10 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-slate-900 mb-2">No se encontraron documentos</h3>
            <p className="text-slate-600 mb-6">Intenta ajustar los filtros de búsqueda</p>
            <button 
              onClick={() => { setSearchTerm(''); setSelectedCategory('all'); }}
              className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Limpiar filtros
            </button>
          </div>
        ) : (
          <div className="space-y-8">
            {Object.entries(groupedDocs).map(([category, docs]) => (
              <div key={category} className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg border border-white/20 overflow-hidden">
                <div className="px-8 py-6 bg-gradient-to-r from-slate-50 to-blue-50 border-b border-slate-200">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xl font-bold text-slate-900 flex items-center">
                      <span className="mr-3 text-2xl">📁</span>
                      {category}
                    </h2>
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold bg-blue-100 text-blue-800">
                      {docs.length} documento{docs.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
                <div className="divide-y divide-slate-100">
                  {docs.map((doc, index) => (
                    <div key={`${doc.path}-${index}`} className="px-8 py-5 hover:bg-slate-50/80 transition-all duration-200 group">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-slate-900 mb-2 text-lg group-hover:text-blue-600 transition-colors">
                            {doc.displayName}
                          </h3>
                          <p className="text-sm text-slate-500 font-mono bg-slate-100 px-3 py-2 rounded-lg inline-block">
                            {doc.path}
                          </p>
                        </div>
                        <div className="ml-6 flex items-center space-x-3">
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700">
                            <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                            </svg>
                            PDF
                          </span>
                          <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                            <button className="p-2 text-slate-400 hover:text-blue-600 transition-colors">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                              </svg>
                            </button>
                          </div>
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
      <footer className="bg-white/80 backdrop-blur-sm border-t border-white/20 mt-16">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-r from-blue-100 to-indigo-100 rounded-2xl mb-4">
              <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">Olivo Galarza Abogados</h3>
            <p className="text-slate-600 mb-1">Base de Conocimiento Especializada</p>
            <p className="text-sm text-slate-500">
              Documentación oficial de Inmigración a España • Actualizada 2025
            </p>
            <div className="mt-4 pt-4 border-t border-slate-200">
              <p className="text-xs text-slate-400">
                Esta base de conocimiento contiene documentos oficiales del Ministerio de Inclusión, Seguridad Social y Migraciones
              </p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
