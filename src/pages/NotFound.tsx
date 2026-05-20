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
      <div className="bg-destructive/20 absolute top-0 left-0 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl" />
      <div className="bg-primary/20 absolute right-0 bottom-0 h-96 w-96 translate-x-1/2 translate-y-1/2 rounded-full blur-3xl" />

      {/* Theme toggle */}
      <div className="absolute top-4 right-4">
        <ThemeToggle variant="minimal" />
      </div>

      <div className="glass-card animate-fade-in-up relative w-full max-w-md overflow-hidden rounded-2xl border-2 p-8 text-center md:p-12">
        {/* Card decorative gradient */}
        <div className="bg-destructive absolute top-0 right-0 h-32 w-32 opacity-10 blur-2xl" />

        <div className="relative">
          {/* Animated 404 icon */}
          <div className="animate-scale-in bg-destructive/10 mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-full">
            <Car
              className="text-destructive h-12 w-12 animate-bounce"
              style={{ animationDuration: '2s' }}
            />
          </div>

          <h1 className="from-destructive to-warning mb-2 bg-gradient-to-r bg-clip-text text-7xl font-bold text-transparent md:text-8xl">
            404
          </h1>
          <p className="text-foreground mb-2 text-xl font-semibold md:text-2xl">
            Parking Spot Not Found
          </p>
          <p className="text-muted-foreground mb-8">
            Looks like this parking spot doesn't exist. Let's get you back on track!
          </p>

          <div className="flex flex-col justify-center gap-3 sm:flex-row">
            <Button
              asChild
              variant="outline"
              className="hover:border-primary h-12 border-2 transition-colors"
            >
              <Link to="/" className="flex items-center gap-2">
                <ArrowLeft className="h-4 w-4" />
                Go Back
              </Link>
            </Button>
            <Button
              asChild
              className="gradient-primary shadow-primary/30 hover:shadow-primary/50 h-12 text-white shadow-lg transition-all hover:scale-[1.02]"
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
