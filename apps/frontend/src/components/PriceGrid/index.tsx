import { PriceCard } from "../PriceCard";
import type { JSX } from "react";
import type { ActiveStock } from "../../types";

type Props = {
  stocks: ActiveStock[];
  onOpen: (symbol: string) => void;
};

export function PriceGrid({ stocks, onOpen }: Props): JSX.Element {
  return (
    <section
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
        gap: 12,
      }}
    >
      {stocks.map((stock) => (
        <PriceCard key={stock.symbol} stock={stock} onOpen={onOpen} />
      ))}
    </section>
  );
}
