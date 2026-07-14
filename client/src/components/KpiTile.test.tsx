import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import KpiTile from './KpiTile';

describe('KpiTile', () => {
  it('displays KPI name in human-readable format', () => {
    render(
      <KpiTile
        kpiName="sprint_commitment"
        value={85}
        ragStatus="green"
        percentChange={5}
        insufficientData={false}
      />
    );
    expect(screen.getByText('Sprint Commitment')).toBeInTheDocument();
  });

  it('displays value with percentage unit for percentage-based KPIs', () => {
    render(
      <KpiTile
        kpiName="sprint_commitment"
        value={85}
        ragStatus="green"
        percentChange={5}
        insufficientData={false}
      />
    );
    expect(screen.getByText('85%')).toBeInTheDocument();
  });

  it('displays value with days unit for dev_cycle_time', () => {
    render(
      <KpiTile
        kpiName="dev_cycle_time"
        value={12}
        ragStatus="amber"
        percentChange={-3}
        insufficientData={false}
      />
    );
    expect(screen.getByText('12 days')).toBeInTheDocument();
  });

  it('displays value without unit for deployment_frequency', () => {
    render(
      <KpiTile
        kpiName="deployment_frequency"
        value={4}
        ragStatus="green"
        percentChange={10}
        insufficientData={false}
      />
    );
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  it('shows "No data available" when value is null', () => {
    render(
      <KpiTile
        kpiName="rollback_rate"
        value={null}
        ragStatus="red"
        percentChange={null}
        insufficientData={false}
      />
    );
    expect(screen.getByText('No data available')).toBeInTheDocument();
  });

  it('shows "No data available" when insufficientData is true', () => {
    render(
      <KpiTile
        kpiName="ai_efficiency"
        value={70}
        ragStatus="green"
        percentChange={2}
        insufficientData={true}
      />
    );
    expect(screen.getByText('No data available')).toBeInTheDocument();
  });

  it('shows up arrow for positive percent change', () => {
    render(
      <KpiTile
        kpiName="sprint_commitment"
        value={85}
        ragStatus="green"
        percentChange={5}
        insufficientData={false}
      />
    );
    expect(screen.getByText('↑ 5%')).toBeInTheDocument();
  });

  it('shows down arrow for negative percent change', () => {
    render(
      <KpiTile
        kpiName="sprint_commitment"
        value={60}
        ragStatus="red"
        percentChange={-8}
        insufficientData={false}
      />
    );
    expect(screen.getByText('↓ 8%')).toBeInTheDocument();
  });

  it('shows dash for null percent change', () => {
    render(
      <KpiTile
        kpiName="sprint_commitment"
        value={85}
        ragStatus="green"
        percentChange={null}
        insufficientData={false}
      />
    );
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('renders RAG badge when value is present', () => {
    render(
      <KpiTile
        kpiName="sprint_commitment"
        value={85}
        ragStatus="green"
        percentChange={5}
        insufficientData={false}
      />
    );
    expect(screen.getByRole('img', { name: /status: green/i })).toBeInTheDocument();
  });
});
