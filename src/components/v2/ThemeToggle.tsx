import { Moon, Sun, Monitor } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface ThemeToggleProps {
  variant?: "default" | "minimal" | "pill";
  className?: string;
}

export function ThemeToggle({ variant = "default", className }: ThemeToggleProps) {
  const { theme, setTheme } = useTheme();

  if (variant === "pill") {
    return (
      <div className={cn(
        "flex items-center gap-1 p-1 rounded-full bg-muted/50 backdrop-blur-sm border border-border/50",
        className
      )}>
        <button
          onClick={() => setTheme("light")}
          className={cn(
            "p-2 rounded-full transition-all duration-300",
            theme === "light" 
              ? "bg-background shadow-md text-primary" 
              : "text-muted-foreground hover:text-foreground"
          )}
          aria-label="Light mode"
        >
          <Sun className="h-4 w-4" />
        </button>
        <button
          onClick={() => setTheme("dark")}
          className={cn(
            "p-2 rounded-full transition-all duration-300",
            theme === "dark" 
              ? "bg-background shadow-md text-primary" 
              : "text-muted-foreground hover:text-foreground"
          )}
          aria-label="Dark mode"
        >
          <Moon className="h-4 w-4" />
        </button>
        <button
          onClick={() => setTheme("system")}
          className={cn(
            "p-2 rounded-full transition-all duration-300",
            theme === "system" 
              ? "bg-background shadow-md text-primary" 
              : "text-muted-foreground hover:text-foreground"
          )}
          aria-label="System theme"
        >
          <Monitor className="h-4 w-4" />
        </button>
      </div>
    );
  }

  if (variant === "minimal") {
    return (
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        className={cn("rounded-full", className)}
        aria-label="Toggle theme"
      >
        <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
        <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="outline" 
          size="icon" 
          className={cn(
            "rounded-full border-border/50 bg-background/50 backdrop-blur-sm",
            className
          )}
        >
          <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          <span className="sr-only">Toggle theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="glass-card">
        <DropdownMenuItem onClick={() => setTheme("light")} className="gap-2 cursor-pointer">
          <Sun className="h-4 w-4" />
          Light
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")} className="gap-2 cursor-pointer">
          <Moon className="h-4 w-4" />
          Dark
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("system")} className="gap-2 cursor-pointer">
          <Monitor className="h-4 w-4" />
          System
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
