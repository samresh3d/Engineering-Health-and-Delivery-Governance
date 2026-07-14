import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App';

describe('App routing', () => {
  it('renders Dashboard page on "/" route', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    );
    // Dashboard now shows a loading state initially while fetching KPI data
    expect(screen.getByText('Loading KPI data...')).toBeInTheDocument();
  });

  it('renders Upload page on "/upload" route', () => {
    render(
      <MemoryRouter initialEntries={['/upload']}>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByText('Upload Sprint Data')).toBeInTheDocument();
  });
});
