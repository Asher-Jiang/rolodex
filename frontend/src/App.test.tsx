import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';

afterEach(() => vi.unstubAllGlobals());

describe('App', () => {
  it('renders the people workspace and loaded contacts', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const payload = url.includes('/api/people/1')
        ? { id: 1, fullName: 'Alice Smith', preferredName: null, company: 'Acme', field: 'VC', context: 'SP Interns 2026', notes: 'Met at demo day', source: 'manual', updatedAt: '2026-08-28 00:00:00', contactMethods: [{ type: 'phone', value: '+16505551234', label: 'Mobile' }], affiliations: [{ id: 1, name: 'UChicago' }], introducedBy: [], introducedTo: [] }
        : url.includes('/filters')
          ? { companies: ['Acme'], fields: ['VC'], affiliations: ['UChicago'] }
          : [{ id: 1, fullName: 'Alice Smith', preferredName: null, company: 'Acme', field: 'VC', notes: 'Met at demo day', source: 'manual', updatedAt: '2026-08-28 00:00:00', contactSummary: 'alice@example.com', affiliations: 'UChicago', introducedBy: null }];
      return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } });
    }));
    render(<App />);
    expect(screen.getByRole('heading', { name: 'People' })).toBeInTheDocument();
    expect(await screen.findByText('Alice Smith')).toBeInTheDocument();
    expect(screen.getAllByText('Acme').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByText('Alice Smith'));
    expect(await screen.findByRole('heading', { name: 'How we met' })).toBeInTheDocument();
    expect(screen.getByText('SP Interns 2026')).toBeInTheDocument();
  });
});
