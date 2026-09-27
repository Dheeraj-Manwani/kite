/// <reference types="vite/client" />
import type { KiteAPI } from '../shared/types';
declare global { interface Window { kite: KiteAPI } }
