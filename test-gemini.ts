import fetch from 'node-fetch';

(async () => {
  try {
    const res = await fetch('http://localhost:3000/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: "Tu es un assistant pharmacien. Extrait les médicaments: Paracétamol 500mg, 1 boite", text: "" })
    });
    console.log(await res.json());
  } catch(e) {
    console.error(e);
  }
})();
