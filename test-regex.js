const data = {
  text: '```json\n{\n  "articles": [\n    {\n      "nom_article": "Paracétamol",\n      "dosage": "500mg",\n      "posologie": "1 boite"\n    },\n    {\n      "nom_article": "Amoxicilline",\n      "dosage": "",\n      "posologie": ""\n    }\n  ],\n  "etablissement": "Dr Zongo, CHU"\n}\n```'
};
const cleanText = (data.text || '{}').replace(/```json/ig, '').replace(/```/g, '').trim();
const jsonStr = cleanText.match(/\{[\s\S]*\}|\[[\s\S]*\]/)?.[0] || '{}';
const parsed = JSON.parse(jsonStr);
console.log(parsed);
