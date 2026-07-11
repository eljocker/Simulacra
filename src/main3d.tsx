import { createRoot } from 'react-dom/client';
import { App } from './ui/App.tsx';
import { ThreeRenderer } from './render3d/three.ts';
import './ui/styles.css';

// 3D prototype entry: exact same App + engine + simulation core, only the
// renderer is swapped for the Three.js one. Proof that src/sim is renderer-agnostic.
createRoot(document.getElementById('root')!).render(
  <App makeRenderer={(canvas) => new ThreeRenderer(canvas)} />,
);
