import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase, isSupabaseConfigured } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { AlertCircle, Car, Loader2, Mail, Lock, User, KeyRound } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ThemeToggle } from "@/components/v2/ThemeToggle";

const ALLOWED_EMAIL_DOMAIN = "@lht.dlh.de";

export default function Auth() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupName, setSignupName] = useState("");
  const [resetEmail, setResetEmail] = useState("");

  useEffect(() => {
    let mounted = true;

    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (mounted && session) {
        navigate("/");
      }
    };
    checkSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted && session) {
        navigate("/");
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [navigate]);

  const validateEmail = (email: string): boolean => {
    if (!email || email.trim() === "") {
      toast.error("Email is required");
      return false;
    }
    if (!email.includes("@")) {
      toast.error("Please enter a valid email address");
      return false;
    }
    if (!email.endsWith(ALLOWED_EMAIL_DOMAIN)) {
      toast.error(`Only ${ALLOWED_EMAIL_DOMAIN} email addresses are allowed`);
      return false;
    }
    return true;
  };

  const validatePassword = (password: string): boolean => {
    if (!password || password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return false;
    }
    return true;
  };

  const validateName = (name: string): boolean => {
    if (!name || name.trim() === "") {
      toast.error("Name is required");
      return false;
    }
    return true;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateEmail(loginEmail) || !validatePassword(loginPassword)) {
      return;
    }

    setIsLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: loginEmail.trim(),
        password: loginPassword,
      });

      if (error) {
        toast.error(error.message || "Invalid email or password");
      } else if (data.session) {
        toast.success("Welcome back!");
        navigate("/");
      }
    } catch (error) {
      toast.error("Failed to connect. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateName(signupName) || !validateEmail(signupEmail) || !validatePassword(signupPassword)) {
      return;
    }

    setIsLoading(true);

    try {
      const { data, error } = await supabase.auth.signUp({
        email: signupEmail.trim(),
        password: signupPassword,
        options: {
          data: {
            user_name: signupName.trim(),
          },
        },
      });

      if (error) {
        toast.error(error.message || "Failed to create account");
      } else if (data.user) {
        if (data.session) {
          toast.success("Account created successfully!");
          navigate("/");
        } else {
          toast.success("Account created! Please check your email to confirm.");
        }
      }
    } catch (error) {
      toast.error("Failed to connect. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateEmail(resetEmail)) {
      return;
    }

    setIsLoading(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail.trim(), {
        redirectTo: `${window.location.origin}/auth`,
      });

      if (error) {
        toast.error(error.message || "Failed to send reset email");
      } else {
        toast.success("Check your email for a password reset link");
        setResetEmail("");
      }
    } catch (error) {
      toast.error("Failed to connect. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center mesh-gradient p-4 relative">
      {/* Decorative elements */}
      <div className="absolute top-0 left-0 w-96 h-96 bg-primary/20 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-accent/20 rounded-full blur-3xl translate-x-1/2 translate-y-1/2" />
      
      {/* Theme toggle */}
      <div className="absolute top-4 right-4">
        <ThemeToggle variant="minimal" />
      </div>

      <Card className="w-full max-w-md glass-card border-2 shadow-2xl animate-fade-in-up relative overflow-hidden">
        {/* Card decorative gradient */}
        <div className="absolute top-0 right-0 w-32 h-32 gradient-primary opacity-10 blur-2xl" />
        
        <CardHeader className="space-y-4 text-center relative">
          <div className="mx-auto w-16 h-16 gradient-primary rounded-2xl flex items-center justify-center shadow-lg shadow-primary/30 animate-scale-in">
            <Car className="h-8 w-8 text-white" />
          </div>
          <div>
            <CardTitle className="text-3xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              Park It Easy
            </CardTitle>
            <CardDescription className="text-base mt-2">
              Sign in to manage your parking bookings
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="relative">
          {!isSupabaseConfigured ? (
            <Alert variant="destructive" className="border-2">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Configuration Required</AlertTitle>
              <AlertDescription>
                The application is not properly configured. Please contact the administrator to set up the required Supabase environment variables.
              </AlertDescription>
            </Alert>
          ) : (
            <Tabs defaultValue="login" className="w-full">
              <TabsList className="grid w-full grid-cols-3 h-12 p-1 bg-muted/50">
                <TabsTrigger value="login" className="data-[state=active]:gradient-primary data-[state=active]:text-white data-[state=active]:shadow-md transition-all">Login</TabsTrigger>
                <TabsTrigger value="signup" className="data-[state=active]:gradient-primary data-[state=active]:text-white data-[state=active]:shadow-md transition-all">Sign Up</TabsTrigger>
                <TabsTrigger value="reset" className="data-[state=active]:gradient-primary data-[state=active]:text-white data-[state=active]:shadow-md transition-all">Reset</TabsTrigger>
              </TabsList>

            <TabsContent value="login" className="mt-6">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="login-email" className="text-sm font-medium">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="login-email"
                      type="email"
                      placeholder="your@lht.dlh.de"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      required
                      disabled={isLoading}
                      className="pl-10 h-12 border-2 focus:border-primary transition-colors"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="login-password" className="text-sm font-medium">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="login-password"
                      type="password"
                      placeholder="••••••••"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      required
                      disabled={isLoading}
                      minLength={6}
                      className="pl-10 h-12 border-2 focus:border-primary transition-colors"
                    />
                  </div>
                </div>
                <Button 
                  type="submit" 
                  className="w-full h-12 gradient-primary text-white font-semibold shadow-lg shadow-primary/30 hover:shadow-primary/50 transition-all hover:scale-[1.02]" 
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Logging in...
                    </>
                  ) : "Log In"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup" className="mt-6">
              <form onSubmit={handleSignup} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signup-name" className="text-sm font-medium">Full Name</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="signup-name"
                      type="text"
                      placeholder="Your Name"
                      value={signupName}
                      onChange={(e) => setSignupName(e.target.value)}
                      required
                      disabled={isLoading}
                      className="pl-10 h-12 border-2 focus:border-primary transition-colors"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-email" className="text-sm font-medium">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="signup-email"
                      type="email"
                      placeholder="your@lht.dlh.de"
                      value={signupEmail}
                      onChange={(e) => setSignupEmail(e.target.value)}
                      required
                      disabled={isLoading}
                      className="pl-10 h-12 border-2 focus:border-primary transition-colors"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-info"></span>
                    Only @lht.dlh.de email addresses are allowed
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password" className="text-sm font-medium">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="signup-password"
                      type="password"
                      placeholder="••••••••"
                      value={signupPassword}
                      onChange={(e) => setSignupPassword(e.target.value)}
                      required
                      disabled={isLoading}
                      minLength={6}
                      className="pl-10 h-12 border-2 focus:border-primary transition-colors"
                    />
                  </div>
                </div>
                <Button 
                  type="submit" 
                  className="w-full h-12 gradient-primary text-white font-semibold shadow-lg shadow-primary/30 hover:shadow-primary/50 transition-all hover:scale-[1.02]" 
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating account...
                    </>
                  ) : "Sign Up"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="reset" className="mt-6">
              <form onSubmit={handleResetPassword} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="reset-email" className="text-sm font-medium">Email</Label>
                  <div className="relative">
                    <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="reset-email"
                      type="email"
                      placeholder="your@lht.dlh.de"
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      required
                      disabled={isLoading}
                      className="pl-10 h-12 border-2 focus:border-primary transition-colors"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-info"></span>
                    Enter your email to receive a password reset link
                  </p>
                </div>
                <Button 
                  type="submit" 
                  className="w-full h-12 gradient-primary text-white font-semibold shadow-lg shadow-primary/30 hover:shadow-primary/50 transition-all hover:scale-[1.02]" 
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending...
                    </>
                  ) : "Send Reset Link"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
