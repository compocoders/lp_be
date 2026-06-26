import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdf = require('pdf-parse');
console.log("pdf export is:", typeof pdf, Object.keys(pdf || {}));
import fs from 'fs/promises';

async function test() {
    try {
        // Let's create a tiny dummy PDF to test
        const pdfBytes = Buffer.from(`%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /MediaBox [0 0 612 792] /Contents 5 0 R >>
endobj
4 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
5 0 obj
<< /Length 44 >>
stream
BT /F1 24 Tf 100 700 Td (Hello World) Tj ET
endstream
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000244 00000 n 
0000000332 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
427
%%EOF`, 'utf-8');
        
        const pdfData = await pdf(pdfBytes);
        console.log("Extracted text:", pdfData.text);
        console.log("Length:", pdfData.text.length);
    } catch (e) {
        console.error("PDF parse error", e);
    }
}
test();
