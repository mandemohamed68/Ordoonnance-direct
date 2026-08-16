import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export interface PaginatedListProps<T> {
  items: T[];
  pageSize?: number;
  renderItem?: (item: T, index: number) => React.ReactNode;
  headers?: string[];
  renderRow?: (item: T, index: number) => React.ReactNode;
  emptyMessage?: string;
  emptyIcon?: React.ReactNode;
  title?: string;
  subtitle?: string;
}

export function PaginatedList<T extends { id?: string }>({
  items,
  pageSize = 10,
  renderItem,
  headers,
  renderRow,
  emptyMessage = "Aucun élément à afficher",
  emptyIcon,
  title,
  subtitle,
}: PaginatedListProps<T>) {
  const [currentPage, setCurrentPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [items.length, totalPages, currentPage]);

  const startIndex = (currentPage - 1) * pageSize;
  const currentItems = items.slice(startIndex, startIndex + pageSize);

  if (items.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center shadow-xs">
        {emptyIcon && <div className="flex justify-center mb-3 text-slate-400">{emptyIcon}</div>}
        <p className="text-slate-700 font-semibold text-sm">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden flex flex-col my-3">
      {(title || subtitle) && (
        <div className="px-4 py-3 bg-slate-50/60 border-b border-slate-100 flex items-center justify-between">
          <div>
            {title && <h4 className="text-sm font-bold text-slate-900">{title}</h4>}
            {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
          </div>
          <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200/60">
            {items.length} {items.length > 1 ? 'éléments' : 'élément'}
          </span>
        </div>
      )}

      {/* Table view if headers and renderRow are provided */}
      {headers && renderRow ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              <tr>
                {headers.map((h, i) => (
                  <th key={i} className="px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {currentItems.map((item, idx) => (
                <tr key={item.id || idx} className="hover:bg-slate-50/80 transition-colors">
                  {renderRow(item, startIndex + idx)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        /* Line-row list view if renderItem is provided */
        <div className="divide-y divide-slate-100">
          {currentItems.map((item, idx) => (
            <div key={item.id || idx} className="p-3 sm:p-3.5 hover:bg-slate-50/70 transition-colors">
              {renderItem && renderItem(item, startIndex + idx)}
            </div>
          ))}
        </div>
      )}

      {/* Pagination Footer (starting from 10 items) */}
      {items.length > pageSize && (
        <div className="px-4 py-3 bg-slate-50/80 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
          <div className="font-medium text-slate-500">
            Affichage de <span className="font-bold text-slate-900">{startIndex + 1}</span> à <span className="font-bold text-slate-900">{Math.min(startIndex + pageSize, items.length)}</span> sur <span className="font-bold text-slate-900">{items.length}</span> lignes
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed font-semibold transition-all text-xs"
            >
              <ChevronLeft size={14} />
              <span>Précédent</span>
            </button>

            <div className="flex items-center gap-1 px-1">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                <button
                  key={page}
                  type="button"
                  onClick={() => setCurrentPage(page)}
                  className={`w-7 h-7 rounded-lg text-xs font-bold transition-all ${
                    currentPage === page
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {page}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed font-semibold transition-all text-xs"
            >
              <span>Suivant</span>
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
