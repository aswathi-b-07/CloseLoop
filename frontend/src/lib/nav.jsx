// Navigation model shared by the sidebar and the mobile nav. One source of truth
// for routes, labels, the one-line purpose (shown in the top bar and as tooltips),
// and each view's icon — so a new user can read the structure at a glance.

export const ROUTES = {
  overview: {
    label: 'Overview',
    title: 'Money overview',
    desc: 'Where every rupee sits in the reconciliation loop',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M7 12h10M10 17h4" />
      </svg>
    ),
  },
  accuracy: {
    label: 'Accuracy',
    title: 'Accuracy & method',
    desc: 'Measured performance, per-type scores, and which tier decided each case',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 19V5M4 19h16M8 16v-4m4 4V8m4 8v-6" />
      </svg>
    ),
  },
  exceptions: {
    label: 'Exceptions',
    title: 'Exceptions to review',
    desc: 'The honest list of everything that did not tie out',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.3 3.86l-8.5 14.7A2 2 0 003.5 21.5h17a2 2 0 001.7-3L13.7 3.86a2 2 0 00-3.4 0z" />
      </svg>
    ),
  },
  ask: {
    label: 'Ask',
    title: 'Settlement Q&A',
    desc: 'Ask questions in plain English over the reconciled data',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h8M8 14h5M21 12a8 8 0 01-11.5 7.2L3 21l1.8-6.5A8 8 0 1121 12z" />
      </svg>
    ),
  },
}

export const ROUTE_ORDER = ['overview', 'accuracy', 'exceptions', 'ask']
export const DEFAULT_ROUTE = 'overview'
