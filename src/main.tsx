import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import './styles/motion.css';
import { MotionRuntime } from './components/MotionPrimitives.js';

createRoot(document.getElementById('root')!).render(<MotionRuntime><App /></MotionRuntime>);
