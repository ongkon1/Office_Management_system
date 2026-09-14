from pathlib import Path
import json
import pdfplumber
import pypdfium2 as pdfium
from pypdf import PdfReader

root = Path(__file__).resolve().parents[1]
pdf_path = root / "output" / "pdf" / "powerinai-user-journey-guide.pdf"
render_dir = root / "tmp" / "pdfs" / "user-journey-render"
render_dir.mkdir(parents=True, exist_ok=True)

reader = PdfReader(pdf_path)
assert len(reader.pages) >= 10, "Expected a substantial journey guide"
metadata = reader.metadata or {}
assert metadata.get("/Title") == "PowerInAI User Journey Guide"

with pdfplumber.open(pdf_path) as pdf:
    text = "\n".join(page.extract_text() or "" for page in pdf.pages)
    required = [
        "Employee journeys", "Team Lead journeys", "HR and finance-capability journeys",
        "Management and administrator journeys", "Procurement and expense journeys",
        "Reporting journey", "Cross-role lifecycle", "Plain-language glossary",
        "There is deliberately no Approve day", "Exactly 12:00 is Overtime",
    ]
    missing = [item for item in required if item not in text]
    assert not missing, f"Missing expected content: {missing}"

doc = pdfium.PdfDocument(str(pdf_path))
sizes = []
for index in range(len(doc)):
    bitmap = doc[index].render(scale=1.4)
    image = bitmap.to_pil()
    target = render_dir / f"page-{index + 1:02d}.png"
    image.save(target)
    sizes.append({"page": index + 1, "width": image.width, "height": image.height})

print(json.dumps({"pages": len(reader.pages), "bytes": pdf_path.stat().st_size, "renders": sizes}, indent=2))
