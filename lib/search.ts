import { materialLabel, genderLabel, type Product } from "@/data/products";
import { frameShapeLabel } from "@/lib/frameShapes";

/**
 * Catalogue text search. Every term the user typed has to match somewhere
 * in the product — name, brand, SKU, category, colours, frame shape,
 * material, gender, description — in either language, and better matches
 * (brand or name) come first.
 */

/** Lower-cased, Arabic diacritics stripped, alef/yaa/taa-marbuta variants folded. */
export function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[ً-ْـ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .trim();
}

function haystack(p: Product): { primary: string; secondary: string } {
  const primary = normalizeText([p.brand, p.name, p.sku ?? ""].join(" "));
  const secondary = normalizeText(
    [
      p.category,
      p.shortDescription ?? "",
      p.description,
      p.colors.map((c) => c.name).join(" "),
      p.specs?.colorName ?? "",
      frameShapeLabel[p.tryOn.frameShape] ?? "",
      p.tryOn.frameShape,
      p.specs?.material ? materialLabel[p.specs.material] : "",
      p.specs?.material ?? "",
      p.specs?.gender ? genderLabel[p.specs.gender] : "",
      p.specs?.gender ?? "",
    ].join(" ")
  );
  return { primary, secondary };
}

export function searchProducts(products: Product[], query: string): Product[] {
  const terms = normalizeText(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return products;
  const scored: { product: Product; score: number }[] = [];
  for (const product of products) {
    const { primary, secondary } = haystack(product);
    let score = 0;
    let ok = true;
    for (const term of terms) {
      if (primary.includes(term)) score += primary.startsWith(term) ? 3 : 2;
      else if (secondary.includes(term)) score += 1;
      else {
        ok = false;
        break;
      }
    }
    if (ok) scored.push({ product, score });
  }
  return scored.sort((a, b) => b.score - a.score).map((s) => s.product);
}
