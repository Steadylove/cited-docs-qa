import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts } from "pdf-lib";

/** Source text for fixtures/harbor-pine-handbook.pdf. Kept short on purpose. */
export const HANDBOOK_PAGES: string[][] = [
  [
    "Harbor & Pine Handbook — Company",
    "Harbor & Pine is a Portland coffee roaster founded in 2011 by Maya Chen.",
    "The flagship cafe is at 418 Belmont Street.",
    "Handbook version 7.4 is effective 1 June 2025.",
    "The company employs 86 people across roasting, retail, and wholesale.",
  ],
  [
    "Harbor & Pine Handbook — Time off",
    "Full-time employees accrue 18 vacation days per year.",
    "Sick leave is 10 days per year and does not roll over.",
    "Parental leave is 16 weeks paid.",
    "The winter closure runs from 24 December through 1 January.",
  ],
  [
    "Harbor & Pine Handbook — Roastery safety",
    "The roaster temperature limit is 210 degrees Celsius.",
    "Green coffee is stored below 20 degrees Celsius and 60 percent humidity.",
    "Employees must wear cut-resistant gloves when operating the destoner.",
    "Incident reports must be filed within 24 hours in the Lumen system.",
  ],
  [
    "Harbor & Pine Handbook — Pay and benefits",
    "The employee wholesale discount is 40 percent.",
    "Health coverage starts on the first day of the month after 30 days of employment.",
    "The retirement match is 4 percent of salary.",
    "Payday is the 15th and the last business day of the month.",
  ],
];

async function main() {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  for (const lines of HANDBOOK_PAGES) {
    const page = doc.addPage([612, 792]);
    let y = 740;
    lines.forEach((line, index) => {
      const size = index === 0 ? 16 : 12;
      const font = index === 0 ? bold : regular;
      const width = font.widthOfTextAtSize(line, size);
      if (width > 468) throw new Error(`Line is wider than the page: ${line}`);
      page.drawText(line, { x: 72, y, size, font });
      y -= index === 0 ? 36 : 24;
    });
  }

  const out = path.join(process.cwd(), "fixtures", "harbor-pine-handbook.pdf");
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, await doc.save());
  console.log(`Wrote ${out}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
