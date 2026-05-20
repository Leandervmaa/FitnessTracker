import fs from 'fs';
import path from 'path';

const dir = '/Users/leandervanmaarschalkerwaard/Downloads/FitnessTracker/artifacts/fitness-tracker/public/images';
const files = fs.readdirSync(dir).filter(f => f.startsWith('Gemini_Generated_Image_') && f.endsWith('.png'));

for (const file of files) {
  const filePath = path.join(dir, file);
  const buffer = fs.readFileSync(filePath);
  
  // Find text chunks in PNG
  let pos = 8; // skip PNG signature
  const results = [];
  
  while (pos < buffer.length) {
    if (pos + 8 > buffer.length) break;
    const length = buffer.readUInt32BE(pos);
    const type = buffer.toString('ascii', pos + 4, pos + 8);
    
    if (type === 'tEXt' || type === 'iTXt' || type === 'zTXt') {
      const data = buffer.slice(pos + 8, pos + 8 + length);
      // tEXt: keyword (null-terminated) + text
      const nullIdx = data.indexOf(0);
      if (nullIdx !== -1) {
        const keyword = data.toString('ascii', 0, nullIdx);
        const text = data.toString('utf8', nullIdx + 1);
        results.push({ keyword, text });
      }
    }
    pos += 8 + length + 4; // length + chunk type + chunk data + CRC
  }
  
  if (results.length > 0) {
    console.log(`File: ${file}`);
    results.forEach(r => {
      if (r.keyword.includes('XML')) {
        console.log(`  Raw XML Start: ${r.text.substring(0, 800).replace(/\s+/g, ' ')}`);
      } else {
        console.log(`  [${r.keyword}]: ${r.text.substring(0, 100)}...`);
      }
    });
  } else {
    // Let's print the size or basic info
    console.log(`File: ${file} (No metadata found, size: ${buffer.length} bytes)`);
  }
}
