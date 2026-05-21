import { Moon, Sun, Monitor } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

interface ThemeToggleProps {
  variant?: 'default' | 'minimal' | 'pill';
  className?: string;
}

export function ThemeToggle({ variant = 'default', className }: ThemeToggleProps) {
  const { theme, setTheme } = useTheme();

  if (variant === 'pill') {
    return (
      <div
        className={cn(
          'bg-muted/50 border-border/50 flex items-center gap-1 rounded-full border p-1 backdrop-blur-sm',
          className
        )}
      >
        <button
          onClick={() => setTheme('light')}
          className={cn(
            'rounded-full p-2 transition-all duration-300',
            theme === 'light'
              ? 'bg-background text-primary shadow-md'
              : 'text-muted-foreground hover:text-foreground'
          )}
          aria-label="Light mode"
        >
          <Sun className="h-4 w-4" />
        </button>
        <button
          onClick={() => setTheme('dark')}
          className={cn(
            'rounded-full p-2 transition-all duration-300',
            theme === 'dark'
              ? 'bg-background text-primary shadow-md'
              : 'text-muted-foreground hover:text-foreground'
          )}
          aria-label="Dark mode"
        >
          <Moon className="h-4 w-4" />
        </button>
        <button
          onClick={() => setTheme('system')}
          className={cn(
            'rounded-full p-2 transition-all duration-300',
            theme === 'system'
              ? 'bg-background text-primary shadow-md'
              : 'text-muted-foreground hover:text-foreground'
          )}
          aria-label="System theme"
        >
          <Monitor className="h-4 w-4" />
        </button>
      </div>
    );
  }

  if (variant === 'minimal') {
    return (
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        className={cn('rounded-full', className)}
        aria-label="Toggle theme"
      >
        <Sun className="h-5 w-5 scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
        <Moon className="absolute h-5 w-5 scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
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
            'border-border/50 bg-background/50 rounded-full backdrop-blur-sm',
            className
          )}
        >
          <Sun className="h-5 w-5 scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
          <Moon className="absolute h-5 w-5 scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
          <span className="sr-only">Toggle theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="glass-card">
        <DropdownMenuItem onClick={() => setTheme('light')} className="cursor-pointer gap-2">
          <Sun className="h-4 w-4" />
          Light
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('dark')} className="cursor-pointer gap-2">
          <Moon className="h-4 w-4" />
          Dark
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('system')} className="cursor-pointer gap-2">
          <Monitor className="h-4 w-4" />
          System
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
