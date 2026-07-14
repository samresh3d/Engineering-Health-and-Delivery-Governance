import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import type { ColDef } from 'ag-grid-community';
import { DataTable } from './DataTable';

interface SampleRow {
  row: number;
  field: string;
  message: string;
}

describe('DataTable', () => {
  const sampleColumns: ColDef<SampleRow>[] = [
    { field: 'row', headerName: 'Row', width: 80 },
    { field: 'field', headerName: 'Field', width: 200 },
    { field: 'message', headerName: 'Message', flex: 1 },
  ];

  const sampleData: SampleRow[] = [
    { row: 1, field: 'team', message: 'Required field missing' },
    { row: 2, field: 'sprint_id', message: 'Invalid format' },
    { row: 3, field: 'value', message: 'Must be a number' },
  ];

  it('renders without crashing', () => {
    const { container } = render(
      <DataTable columns={sampleColumns} data={sampleData} />
    );
    expect(container.querySelector('.ag-root-wrapper')).toBeInTheDocument();
  });

  it('renders column headers', () => {
    render(<DataTable columns={sampleColumns} data={sampleData} />);
    expect(screen.getByText('Row')).toBeInTheDocument();
    expect(screen.getByText('Field')).toBeInTheDocument();
    expect(screen.getByText('Message')).toBeInTheDocument();
  });

  it('renders row data', () => {
    render(<DataTable columns={sampleColumns} data={sampleData} />);
    expect(screen.getByText('Required field missing')).toBeInTheDocument();
    expect(screen.getByText('Invalid format')).toBeInTheDocument();
    expect(screen.getByText('Must be a number')).toBeInTheDocument();
  });

  it('renders with empty data', () => {
    const { container } = render(
      <DataTable<SampleRow> columns={sampleColumns} data={[]} />
    );
    expect(container.querySelector('.ag-root-wrapper')).toBeInTheDocument();
  });

  it('accepts custom pageSize prop', () => {
    const { container } = render(
      <DataTable columns={sampleColumns} data={sampleData} pageSize={10} />
    );
    expect(container.querySelector('.ag-root-wrapper')).toBeInTheDocument();
  });

  it('applies custom className to container', () => {
    const { container } = render(
      <DataTable
        columns={sampleColumns}
        data={sampleData}
        className="custom-table"
      />
    );
    expect(container.querySelector('.custom-table')).toBeInTheDocument();
  });
});
