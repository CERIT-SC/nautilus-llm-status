import { ToggleGroup, ToggleGroupItem } from "@e-infra/design-system";

export interface DurationOption<T extends string = string> {
  value: T;
  label: string;
}

interface DurationSelectorProps<T extends string = string> {
  options: readonly DurationOption<T>[];
  value: T;
  onValueChange: (value: T) => void;
  label?: string;
  className?: string;
}

export function DurationSelector<T extends string = string>({
  options,
  value,
  onValueChange,
  label,
  className,
}: DurationSelectorProps<T>) {
  return (
    <div className={`flex flex-col gap-1 ${className ?? ""}`}>
      {label ? <span className="text-text-muted pl-2">{label}</span> : null}
      <ToggleGroup
        className="flex-wrap"
        type="single"
        variant="outline"
        spacing={1}
        value={value}
        onValueChange={(next) => {
          if (next) onValueChange(next as T);
        }}
      >
        {options.map((option) => (
          <ToggleGroupItem
            key={option.value}
            value={option.value}
            aria-label={option.label}
            className="px-4"
          >
            {option.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}
