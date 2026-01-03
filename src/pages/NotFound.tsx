import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { Car, Home, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/v2/ThemeToggle";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center mesh-gradient relative p-4">
      {/* Decorative elements */}
      <div className="absolute top-0 left-0 w-96 h-96 bg-destructive/20 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-primary/20 rounded-full blur-3xl translate-x-1/2 translate-y-1/2" />
      
      {/* Theme toggle */}
      <div className="absolute top-4 right-4">
        <ThemeToggle variant="minimal" />
      </div>

      <div className="text-center glass-card p-8 md:p-12 rounded-2xl border-2 max-w-md w-full animate-fade-in-up relative overflow-hidden">
        {/* Card decorative gradient */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-destructive opacity-10 blur-2xl" />
        
        <div className="relative">
          {/* Animated 404 icon */}
          <div className="mx-auto w-24 h-24 bg-destructive/10 rounded-full flex items-center justify-center mb-6 animate-scale-in">
            <Car className="h-12 w-12 text-destructive animate-bounce" style={{ animationDuration: '2s' }} />
          </div>
          
          <h1 className="text-7xl md:text-8xl font-bold bg-gradient-to-r from-destructive to-warning bg-clip-text text-transparent mb-2">
            404
          </h1>
          <p className="text-xl md:text-2xl font-semibold text-foreground mb-2">
            Parking Spot Not Found
          </p>
          <p className="text-muted-foreground mb-8">
            Looks like this parking spot doesn't exist. Let's get you back on track!
          </p>
          
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button asChild variant="outline" className="h-12 border-2 hover:border-primary transition-colors">
              <Link to="/" className="flex items-center gap-2">
                <ArrowLeft className="h-4 w-4" />
                Go Back
              </Link>
            </Button>
            <Button asChild className="h-12 gradient-primary text-white shadow-lg shadow-primary/30 hover:shadow-primary/50 transition-all hover:scale-[1.02]">
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
