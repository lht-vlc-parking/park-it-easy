import { useLocation, Link } from 'react-router-dom';
import { useEffect } from 'react';
import { Car, Home, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/v2/ThemeToggle';

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error(
      '404 Error: User attempted to access non-existent route:',
      location.pathname.replace(/[^\w/.-]/g, '_')
    );
  }, [location.pathname]);

  return (
    <div className="mesh-gradient relative flex min-h-screen items-center justify-center p-4">
      {/* Decorative elements */}
      <div className="absolute left-0 top-0 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-destructive/20 blur-3xl" />
      <div className="absolute bottom-0 right-0 h-96 w-96 translate-x-1/2 translate-y-1/2 rounded-full bg-primary/20 blur-3xl" />

      {/* Theme toggle */}
      <div className="absolute right-4 top-4">
        <ThemeToggle variant="minimal" />
      </div>

      <div className="glass-card animate-fade-in-up relative w-full max-w-md overflow-hidden rounded-2xl border-2 p-8 text-center md:p-12">
        {/* Card decorative gradient */}
        <div className="absolute right-0 top-0 h-32 w-32 bg-destructive opacity-10 blur-2xl" />

        <div className="relative">
          {/* Animated 404 icon */}
          <div className="mx-auto mb-6 flex h-24 w-24 animate-scale-in items-center justify-center rounded-full bg-destructive/10">
            <Car
              className="h-12 w-12 animate-bounce text-destructive"
              style={{ animationDuration: '2s' }}
            />
          </div>

          <h1 className="mb-2 bg-gradient-to-r from-destructive to-warning bg-clip-text text-7xl font-bold text-transparent md:text-8xl">
            404
          </h1>
          <p className="mb-2 text-xl font-semibold text-foreground md:text-2xl">
            Parking Spot Not Found
          </p>
          <p className="mb-8 text-muted-foreground">
            Looks like this parking spot doesn't exist. Let's get you back on track!
          </p>

          <div className="flex flex-col justify-center gap-3 sm:flex-row">
            <Button
              asChild
              variant="outline"
              className="h-12 border-2 transition-colors hover:border-primary"
            >
              <Link to="/" className="flex items-center gap-2">
                <ArrowLeft className="h-4 w-4" />
                Go Back
              </Link>
            </Button>
            <Button
              asChild
              className="gradient-primary h-12 text-white shadow-lg shadow-primary/30 transition-all hover:scale-[1.02] hover:shadow-primary/50"
            >
              <Link to="/" className="flex items-center gap-2">
                <Home className="h-4 w-4" />
                Home
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
