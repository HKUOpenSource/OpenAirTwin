# ADR 0001: Use React, TypeScript, and Vite for the Core Workbench

- Status: Accepted
- Date: 2026-07-30
- Decision scope: Core desktop workbench; excludes the tutorial website and Python backend

## Context

The workbench already had a Feature Registry, domain Controllers and Transports, seven CSS modules, and strict browser baselines, but its UI was still maintained through static templates and imperative DOM code. Continuing in that form would increase component duplication, ambiguous ownership, and lifecycle leak risks, while a one-shot rewrite would put all five production workflows at risk.

## Decision

The UI rendering layer uses React with strict TypeScript and is built by Vite. Complete UI subtrees have one rendering owner and production converges on one AppShell root. The Feature Registry, feature state, Transports, Controllers, Three.js, Leaflet, and Canvas adapters remain framework-independent.

In production, the Python service serves hashed assets referenced by the Vite manifest. Release packages contain the built output and do not require Node.js or a Vite development server at runtime. The migration must not change REST contracts, the DOM compatibility contract, workflows, visual snapshots, or the desktop support scope.

## Consequences

- Typed props, view models, commands, and explicit subtree ownership are available.
- The project gains a Node build dependency, a lockfile, a production manifest, and frontend static checks.
- Every rendering-boundary change must remove the replaced renderer and listeners at the same time; dual implementations cannot remain indefinitely.
- Normal React updates must not reconstruct the Viewer, Leaflet map, or Canvas engines.
- Changes to Vite integration, React ownership, or renderer retirement must pass the complete frozen workbench regression suite.

## Rejected Alternatives

- Retain a purely imperative DOM: it cannot mechanically enforce component ownership or prevent duplicated patterns.
- Rewrite everything in React at once: the regression surface is too large to prove feature-by-feature equivalence.
- Next.js or SSR: the core workbench gains no SEO or SSR benefit and would expand the Node production boundary.
