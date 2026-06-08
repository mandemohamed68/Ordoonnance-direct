import fs from 'fs';

let code = fs.readFileSync('src/App.tsx', 'utf-8');

// Fix 1: Components that accidentally got their closing tags swapped
code = code.replace(/<\/AnimatePresence>\s*\n\s*\)\}\s*\n\s*<\/>/g, '</>\n        )}\n      </AnimatePresence>');

// Fix 2: Modals that start with <> but end with </AnimatePresence> or anything weird
// We opened them as <> {var && createPortal( ... </AnimatePresence>
// So we find <> {var && createPortal( ... down to </AnimatePresence> and change to </>
code = code.replace(/(<>\s*\n\s*\{[a-zA-Z0-9_]+ && createPortal\([\s\S]*?)<\/AnimatePresence>/g, '$1</>');

fs.writeFileSync('src/App.tsx', code);
