import { useMemo } from 'react';
import { AgGridReact } from 'ag-grid-react';
import type { ColDef } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';

export interface DataTableProps<TData = unknown> {
  /** AG Grid column definitions */
  columns: ColDef<TData>[];
  /** Row data to display */
  data: TData[];
  /** Number of rows per page (default: 25) */
  pageSize?: number;
  /** Optional CSS class name for the container */
  className?: string;
}

/**
 * Reusable data table component wrapping AG Grid Community.
 * Provides sorting, column filtering, and pagination out of the box.
 *
 * @example
 * ```tsx
 * const columns = [
 *   { field: 'row', headerName: 'Row', width: 80 },
 *   { field: 'field', headerName: 'Field', width: 200 },
 *   { field: 'message', headerName: 'Message', flex: 1 },
 * ];
 * <DataTable columns={columns} data={validationErrors} />
 * ```
 */
export function DataTable<TData = unknown>({
  columns,
  data,
  pageSize = 25,
  className,
}: DataTableProps<TData>) {
  const defaultColDef = useMemo<ColDef<TData>>(
    () => ({
      sortable: true,
      filter: true,
      resizable: true,
    }),
    []
  );

  return (
    <div
      className={`ag-theme-alpine ${className || ''}`}
      style={{ width: '100%', height: '100%', minHeight: 400 }}
    >
      <AgGridReact<TData>
        columnDefs={columns}
        rowData={data}
        defaultColDef={defaultColDef}
        pagination={true}
        paginationPageSize={pageSize}
        paginationPageSizeSelector={[10, 25, 50, 100]}
        domLayout="autoHeight"
      />
    </div>
  );
}

export default DataTable;
