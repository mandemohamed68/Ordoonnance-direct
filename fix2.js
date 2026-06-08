import fs from 'fs';

let code = fs.readFileSync('src/App.tsx', 'utf-8');

// Fix line 1897-1898:
// 1897:           </>
// 1898:         </>
// Wait, looking at 1897, it was probably </AnimatePresence> that got changed twice.
code = code.replace(/<\/>\s*\n\s*<\/>\s*\n\s*\)\}/g, '</AnimatePresence>\n        </>\n      )}');

// Fix 7455-7463
code = code.replace(/<AnimatePresence>([\s\S]*?WithdrawalModal[\s\S]*?)<\/>/g, '<AnimatePresence>$1</AnimatePresence>');

fs.writeFileSync('src/App.tsx', code);
