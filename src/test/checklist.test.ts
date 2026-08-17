import { describe, it, expect } from "vitest";
import { computeChecklistStatus, itemAnswerIsValid, checklistPhotoPath } from "@/lib/checklist";

describe("computeChecklistStatus", () => {
  it("conforme quando todos os itens estão ok", () => {
    expect(computeChecklistStatus([{ ok: true }, { ok: true }, { ok: true }])).toBe("conforme");
  });

  it("nao_conforme quando qualquer item é não", () => {
    expect(computeChecklistStatus([{ ok: true }, { ok: false }])).toBe("nao_conforme");
  });

  it("conforme para lista vazia (sem itens = sem não-conformidades)", () => {
    expect(computeChecklistStatus([])).toBe("conforme");
  });
});

describe("itemAnswerIsValid", () => {
  it("ok=true dispensa observação", () => {
    expect(itemAnswerIsValid(true, "")).toBe(true);
  });

  it("ok=false exige observação com pelo menos 3 caracteres", () => {
    expect(itemAnswerIsValid(false, "")).toBe(false);
    expect(itemAnswerIsValid(false, "ab")).toBe(false);
    expect(itemAnswerIsValid(false, "pneu furado")).toBe(true);
  });
});

describe("checklistPhotoPath", () => {
  it("monta path company/checklist/arquivo", () => {
    const path = checklistPhotoPath("abc-123", "chk-456", 2);
    expect(path.startsWith("abc-123/chk-456/")).toBe(true);
    expect(path.endsWith("-2.jpg")).toBe(true);
  });
});
