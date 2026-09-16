from pathlib import Path

from reportlab.graphics.barcode.qr import QrCodeWidget
from reportlab.graphics.shapes import Drawing
from reportlab.lib.colors import Color, HexColor, black, white
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output" / "pdf" / "festholic-eticket-logo.pdf"
MM = 72 / 25.4


def mm(value):
    return value * MM


def main():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    page_w, page_h = A4
    output_w, output_h = mm(120), mm(220)
    c = canvas.Canvas(str(OUTPUT), pagesize=(output_w, output_h))
    c.scale(output_w / page_w, output_h / page_h)
    primary = HexColor("#42149B")
    pink = HexColor("#FF0055")
    muted = HexColor("#85818B")
    light = HexColor("#F4F4F4")

    c.setFillColor(white)
    c.rect(0, 0, page_w, page_h, fill=1, stroke=0)
    c.setFillColor(black)
    c.rect(0, page_h - mm(18), page_w, mm(18), fill=1, stroke=0)
    logo_path = ROOT / "public" / "img" / "logo" / "festholic.png"
    c.drawImage(ImageReader(str(logo_path)), mm(89), page_h - mm(15), mm(32), mm(12), preserveAspectRatio=True, anchor="c", mask="auto")

    hero_y = page_h - mm(77)
    c.setFillColor(primary)
    c.rect(0, hero_y, mm(158), mm(59), fill=1, stroke=0)
    c.setFillColor(HexColor("#301174"))
    c.rect(mm(76), hero_y, mm(17), mm(59), fill=1, stroke=0)
    for points in (
        ((93, 29), (132, 59), (158, 59)),
        ((93, 29), (132, 0), (158, 0)),
    ):
        path = c.beginPath()
        path.moveTo(mm(points[0][0]), hero_y + mm(points[0][1]))
        path.lineTo(mm(points[1][0]), hero_y + mm(points[1][1]))
        path.lineTo(mm(points[2][0]), hero_y + mm(points[2][1]))
        path.close()
        c.drawPath(path, fill=1, stroke=0)
    c.setFillColor(HexColor("#4E18B2"))
    path = c.beginPath()
    path.moveTo(mm(109), hero_y + mm(59))
    path.lineTo(mm(139), hero_y + mm(59))
    path.lineTo(mm(139), hero_y + mm(39))
    path.close()
    c.drawPath(path, fill=1, stroke=0)
    c.setFillColor(white)
    c.rect(mm(158), hero_y, mm(52), mm(59), fill=1, stroke=0)
    image_path = ROOT / "public" / "img" / "apps" / "hardwellportada.png"
    c.drawImage(ImageReader(str(image_path)), mm(20), hero_y + mm(8), mm(52), mm(43), preserveAspectRatio=True, anchor="c", mask="auto")
    c.setFillColor(pink)
    c.rect(mm(87), hero_y + mm(11), mm(1.8), mm(35), fill=1, stroke=0)
    c.setFillColor(white)
    c.setFont("Helvetica", 10)
    c.drawString(mm(92), hero_y + mm(42), "Viernes, 21 de Agosto")
    c.drawString(mm(92), hero_y + mm(35), "2026 / 20:00")
    c.setFont("Helvetica-Bold", 9.5)
    c.drawString(mm(92), hero_y + mm(23), "CENTRO DE")
    c.drawString(mm(92), hero_y + mm(17), "CONVENCIONES COCOS")

    c.setFillColor(HexColor("#333333"))
    c.setFont("Helvetica", 8)
    c.drawCentredString(mm(184), hero_y + mm(52), "N° 713")
    qr = QrCodeWidget("MYFEST|2427441800306965|ROMANTIC STYLE VOL. 01")
    bounds = qr.getBounds()
    drawing = Drawing(mm(34), mm(34), transform=[mm(34) / (bounds[2] - bounds[0]), 0, 0, mm(34) / (bounds[3] - bounds[1]), 0, 0])
    drawing.add(qr)
    drawing.drawOn(c, mm(167), hero_y + mm(15))
    c.setFont("Helvetica", 7.2)
    c.drawCentredString(mm(184), hero_y + mm(8), "2427441800306965")
    start_rgb = (112, 12, 156)
    end_rgb = (255, 0, 85)
    steps = 96
    for step in range(steps):
        progress = step / (steps - 1)
        rgb = tuple((start_rgb[index] + (end_rgb[index] - start_rgb[index]) * progress) / 255 for index in range(3))
        c.setFillColor(Color(*rgb))
        c.rect(page_w * step / steps, hero_y - mm(7), page_w / steps + 0.5, mm(7), fill=1, stroke=0)

    c.setFillColor(primary)
    c.setFont("Helvetica-Bold", 30)
    c.drawCentredString(page_w / 2, page_h - mm(98), "¡YA TIENES TU INVITACIÓN!")
    c.setFont("Helvetica", 10.5)
    c.drawCentredString(page_w / 2, page_h - mm(106), "DISFRUTA DE LOS MEJORES ESPECTÁCULOS CON NOSOTROS")

    c.setFillColor(primary)
    c.rect(0, page_h - mm(123), page_w, mm(11), fill=1, stroke=0)
    c.setFillColor(white)
    c.setFont("Helvetica-Bold", 8.5)
    c.drawString(mm(12), page_h - mm(119), "SECTOR")
    c.drawCentredString(mm(172), page_h - mm(119), "FILA")
    c.drawCentredString(mm(196), page_h - mm(119), "ASIENTO")
    c.setFillColor(light)
    c.rect(0, page_h - mm(144), page_w, mm(21), fill=1, stroke=0)
    c.setFillColor(primary)
    c.setFont("Helvetica", 10.5)
    c.drawString(mm(12), page_h - mm(136), "VIP PREVENTA 2")
    c.drawCentredString(mm(172), page_h - mm(136), "A")
    c.drawCentredString(mm(196), page_h - mm(136), "24")

    c.setFillColor(HexColor("#EFEFF1"))
    c.rect(0, page_h - mm(160), page_w, mm(16), fill=1, stroke=0)
    c.setFillColor(primary)
    c.setFont("Helvetica-Bold", 8.5)
    c.drawString(mm(12), page_h - mm(154), "Categoría:")
    c.setFont("Helvetica", 8.5)
    c.drawString(mm(39), page_h - mm(154), "CORTESÍA")
    c.setFont("Helvetica-Bold", 9.5)
    c.drawString(mm(12), page_h - mm(172), "N° de orden:")
    c.setFillColor(muted)
    c.setFont("Helvetica", 11)
    c.drawString(mm(15), page_h - mm(181), "24274418")

    def detail(label, value, y):
        c.setFillColor(primary)
        c.setFont("Helvetica-Bold", 9)
        c.drawString(mm(12), page_h - mm(y), label)
        c.setFillColor(muted)
        c.setFont("Helvetica", 8.5)
        c.drawString(mm(38), page_h - mm(y), value)

    detail("Evento:", "LIVING FLOW - ROMANTIC STYLE VOL. 01", 201)
    detail("Produce:", "LIVING ENTERTAINMENT SAC", 214)
    detail("RUC:", "20614462257", 227)
    c.setFillColor(primary)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(mm(122), page_h - mm(227), "Precio:")
    c.setFillColor(muted)
    c.setFont("Helvetica", 8.5)
    c.drawString(mm(156), page_h - mm(227), "S/ 0.00")

    c.setFillColor(Color(primary.red, primary.green, primary.blue, alpha=0.45))
    c.setFont("Helvetica-Bold", 18)
    c.drawCentredString(page_w / 2, page_h - mm(245), "CORTESÍA • CORTESÍA • CORTESÍA")
    c.setFillColor(HexColor("#B6B1BC"))
    c.setFont("Helvetica", 5.5)
    c.drawCentredString(page_w / 2, page_h - mm(250), "PROHIBIDA SU VENTA • PROHIBIDA SU VENTA • PROHIBIDA SU VENTA")
    c.setFillColor(HexColor("#19161D"))
    c.setFont("Helvetica-Bold", 12)
    c.drawString(mm(12), page_h - mm(264), "IMPORTANTE")
    c.setStrokeColor(primary)
    c.setLineWidth(mm(1.1))
    c.line(mm(12), page_h - mm(267), mm(40), page_h - mm(267))
    legal = (
        "Este e-ticket es válido únicamente para el evento, fecha, sector y código indicados. "
        "Presenta el QR desde tu celular o impreso junto con un documento de identidad cuando sea solicitado. "
        "El primer escaneo válido permitirá el ingreso y anulará cualquier copia posterior. No compartas el código QR. "
        "MyFest y el organizador no responden por entradas adquiridas a terceros, pérdidas, duplicaciones o alteraciones."
    )
    text = c.beginText(mm(12), page_h - mm(274))
    text.setFont("Helvetica", 6)
    text.setFillColor(HexColor("#706D74"))
    text.setLeading(7.2)
    words, line = legal.split(), ""
    for word in words:
        trial = (line + " " + word).strip()
        if c.stringWidth(trial, "Helvetica", 6) > page_w - mm(24):
            text.textLine(line)
            line = word
        else:
            line = trial
    text.textLine(line)
    c.drawText(text)
    c.save()
    print(OUTPUT)


if __name__ == "__main__":
    main()
