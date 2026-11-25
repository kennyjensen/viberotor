// Numerical routines are unchanged; browser files are supplied as text by the UI.
export function existsSync() { return false; }
export function readFileSync() { throw new Error('Open a file through the browser file picker.'); }
export function writeFileSync() { throw new Error('Use a browser download to save a file.'); }
