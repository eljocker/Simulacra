import { createRoot } from 'react-dom/client';
import { App } from './ui/App.tsx';
import { ThreeRenderer } from './render3d/three.ts';
import './ui/styles.css';

// Simulacra runs in 3D: the farm is rendered with Three.js. The simulation core
// (src/sim) is renderer-agnostic — only this injected renderer changes.
createRoot(document.getElementById('root')!).render(
  <App makeRenderer={(canvas) => new ThreeRenderer(canvas)} />,
);
