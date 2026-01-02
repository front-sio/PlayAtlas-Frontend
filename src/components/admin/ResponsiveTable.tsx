import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export interface Column<T> {
  key: keyof T;
  label: string;
  render?: (value: any, item: T, index: number) => React.ReactNode;
  mobilePriority?: 'high' | 'medium' | 'low';
  className?: string;
  headerClassName?: string;
}

export interface ResponsiveTableProps<T> {
  data: T[];
  columns: Column<T>[];
  keyExtractor: (item: T, index: number) => string;
  emptyMessage?: string;
  emptyIcon?: React.ReactNode;
  onRowClick?: (item: T, index: number) => void;
  className?: string;
}

export function ResponsiveTable<T>({
  data,
  columns,
  keyExtractor,
  emptyMessage = 'No data available',
  emptyIcon,
  onRowClick,
  className = ''
}: ResponsiveTableProps<T>) {
  if (!data || data.length === 0) {
    return (
      <div className="text-center py-8">
        <div className="text-slate-500 mb-2">{emptyMessage}</div>
        {emptyIcon && <div className="mx-auto">{emptyIcon}</div>}
      </div>
    );
  }

  // Sort columns by mobile priority for card view
  const sortedColumns = [...columns].sort((a, b) => {
    const priority = { high: 0, medium: 1, low: 2 };
    return (priority[a.mobilePriority || 'medium'] || 1) - (priority[b.mobilePriority || 'medium'] || 1);
  });

  const renderCell = (item: T, column: Column<T>, index: number): React.ReactNode => {
    const value = item[column.key];
    return column.render ? column.render(value, item, index) : (value as React.ReactNode);
  };

  return (
    <>
      {/* Mobile Card View */}
      <div className={`md:hidden space-y-4 ${className}`}>
        {data.map((item, index) => (
          <Card
            key={keyExtractor(item, index)}
            className="border border-slate-200 bg-slate-50"
            onClick={() => onRowClick?.(item, index)}
          >
            <CardContent className="p-4">
              <div className="space-y-3">
                {sortedColumns.map((column, colIndex) => (
                  <div
                    key={String(column.key)}
                    className={column.mobilePriority === 'low' ? 'hidden' : ''}
                  >
                    <p className="text-xs text-slate-500 mb-1">{column.label}</p>
                    <div className={column.className || 'text-sm text-slate-900'}>
                      {renderCell(item, column, index)}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Desktop Table View */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              {columns.map((column) => (
                <th
                  key={String(column.key)}
                  className={`text-left p-4 text-slate-600 font-medium ${column.headerClassName || ''}`}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((item, index) => (
              <tr
                key={keyExtractor(item, index)}
                className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors cursor-pointer"
                onClick={() => onRowClick?.(item, index)}
              >
                {columns.map((column) => (
                  <td key={String(column.key)} className="p-4">
                    <div className={column.className || ''}>
                      {renderCell(item, column, index)}
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
