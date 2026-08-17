import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import ValidationBadge, { collectWarnings } from "@/components/pagamentos/ValidationBadge";

describe("ValidationBadge", () => {
  it("1. valida sem warnings -> verde, sem lista", () => {
    const { container } = render(<ValidationBadge status="valida" issues={[]} />);
    expect(screen.getByText(/NF validada pela IA/i)).toBeInTheDocument();
    expect(container.querySelector("ul")).toBeNull();
    expect(container.querySelector(".text-success")).toBeTruthy();
  });

  it("2. valida com warnings -> amarelo, lista de avisos visível, não marca como inválida", () => {
    const warnings = ["Aviso A", "Aviso B"];
    const { container } = render(
      <ValidationBadge status="valida" issues={[]} warnings={warnings} />,
    );
    expect(screen.getByText(/Válida com 2 aviso/i)).toBeInTheDocument();
    expect(screen.getByText("Aviso A")).toBeInTheDocument();
    expect(screen.getByText("Aviso B")).toBeInTheDocument();
    expect(screen.queryByText(/inválida/i)).toBeNull();
    expect(container.querySelector("ul")).toBeTruthy();
  });

  it("3. invalida com issues -> vermelho, lista de pendências críticas", () => {
    const issues = ["Tomador inválido", "CNPJ não confere"];
    const { container } = render(<ValidationBadge status="invalida" issues={issues} />);
    expect(screen.getByText(/NF inválida/i)).toBeInTheDocument();
    expect(screen.getByText("Tomador inválido")).toBeInTheDocument();
    expect(screen.getByText("CNPJ não confere")).toBeInTheDocument();
    expect(container.querySelector(".text-destructive")).toBeTruthy();
  });

  it("4. warnings vindos de múltiplas fontes -> deduplicados", () => {
    const warnings = ["Duplicado", "Único da prop"];
    const validationData = {
      validation_warnings: ["DUPLICADO", "Único do validation_warnings"],
      validacao: { alertas: ["duplicado", "Único do alertas"] },
    };
    render(
      <ValidationBadge
        status="valida"
        issues={[]}
        warnings={warnings}
        validationData={validationData}
      />,
    );
    // 4 únicos: Duplicado (qualquer caixa), Único da prop, Único do validation_warnings, Único do alertas
    const collected = collectWarnings(warnings, validationData);
    expect(collected).toHaveLength(4);

    expect(screen.getByText(/Válida com 4 aviso/i)).toBeInTheDocument();
    expect(screen.getByText("Único da prop")).toBeInTheDocument();
    expect(screen.getByText("Único do validation_warnings")).toBeInTheDocument();
    expect(screen.getByText("Único do alertas")).toBeInTheDocument();
    // Apenas a primeira ocorrência (case original) deve existir
    expect(screen.getAllByText(/duplicado/i)).toHaveLength(1);
  });

  it("5a. compact=true valida -> renderiza compacto", () => {
    render(<ValidationBadge status="valida" issues={[]} compact />);
    expect(screen.getByText(/Validada/i)).toBeInTheDocument();
  });

  it("5b. compact=true valida com warnings -> renderiza compacto amarelo", () => {
    render(
      <ValidationBadge
        status="valida"
        issues={[]}
        warnings={["A", "B"]}
        compact
      />,
    );
    expect(screen.getByText(/Válida c\/ 2 aviso/i)).toBeInTheDocument();
  });

  it("5c. compact=true invalida -> renderiza compacto vermelho", () => {
    render(
      <ValidationBadge status="invalida" issues={["X", "Y", "Z"]} compact />,
    );
    expect(screen.getByText(/3 pendência/i)).toBeInTheDocument();
  });

  it("retorna null quando status é vazio", () => {
    const { container } = render(<ValidationBadge status={null} issues={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
