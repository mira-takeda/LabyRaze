// Project-local loader: avoids tsx's Windows account lookup and needs no installation.
import * as modules from 'node:module';
import { resolve, load } from './typescriptLoader.mjs';
if (typeof modules.registerHooks === 'function') modules.registerHooks({ resolve, load });
else modules.register('./typescriptLoader.mjs', import.meta.url); // Node 22.12 compatibility
