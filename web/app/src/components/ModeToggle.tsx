import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import {
  Button,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
} from "@e-infra/design-system";
import { useUIStore } from "../stores/ui-store";

const THEME_OPTIONS: { value: "light" | "dark" | "system"; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

export function ThemeItems({ onSelect }: { onSelect?: () => void }) {
  const theme = useUIStore((s) => s.theme);
  const setTheme = useUIStore((s) => s.setTheme);

  return (
    <div className="flex flex-col gap-1">
      {THEME_OPTIONS.map((t) => (
        <Button
          key={t.value}
          variant={theme === t.value ? "secondary" : "ghost"}
          size="sm"
          className="w-full justify-start"
          onClick={() => {
            setTheme(t.value);
            onSelect?.();
          }}
        >
          {t.label}
        </Button>
      ))}
    </div>
  );
}

export function ModeToggle() {
  const [open, setOpen] = useState(false);
  const theme = useUIStore((s) => s.theme);

  useEffect(() => {
    const root = document.documentElement;
    if (
      theme === "dark" ||
      (theme === "system" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches)
    ) {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, [theme]);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon-lg" aria-label="Toggle theme">
          <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <ThemeItems onSelect={() => setOpen(false)} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
