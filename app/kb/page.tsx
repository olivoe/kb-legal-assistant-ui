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
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-6xl mx-auto">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Cargando documentos de la base de conocimiento...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Base de Conocimiento</h1>
              <p className="text-gray-600 mt-1">
                Documentos de Inmigración a España - {documents.length} documentos disponibles
              </p>
            </div>
            <a 
              href="/"
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
            >
              Volver al Chat
            </a>
          </div>
        </div>
      </header>

      {/* Filters */}
      <div className="bg-white border-b">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Search */}
            <div className="flex-1">
              <input
                type="text"
                placeholder="Buscar documentos..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            
            {/* Category Filter */}
            <div className="sm:w-64">
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
      <main className="max-w-6xl mx-auto px-6 py-8">
        {filteredDocs.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-gray-400 text-6xl mb-4">📄</div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No se encontraron documentos</h3>
            <p className="text-gray-600">Intenta ajustar los filtros de búsqueda</p>
          </div>
        ) : (
          <div className="space-y-8">
            {Object.entries(groupedDocs).map(([category, docs]) => (
              <div key={category} className="bg-white rounded-lg shadow-sm border">
                <div className="px-6 py-4 border-b bg-gray-50">
                  <h2 className="text-lg font-semibold text-gray-900">
                    {category} ({docs.length} documentos)
                  </h2>
                </div>
                <div className="divide-y">
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
                        <div className="ml-4 flex items-center space-x-2">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
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
      <footer className="bg-white border-t mt-12">
        <div className="max-w-6xl mx-auto px-6 py-6">
          <div className="text-center text-gray-600">
            <p>Base de Conocimiento de Olivo Galarza Abogados</p>
            <p className="text-sm mt-1">
              Documentación oficial de Inmigración a España
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
