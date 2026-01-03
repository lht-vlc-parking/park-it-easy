import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, isSupabaseConfigured } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { AlertCircle, Car, Loader2, Mail, Lock, User, KeyRound } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ThemeToggle } from '@/components/v2/ThemeToggle';

const ALLOWED_EMAIL_DOMAIN = '@lht.dlh.de';

export default function Auth() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupName, setSignupName] = useState('');
  const [resetEmail, setResetEmail] = useState('');

  useEffect(() => {
    let mounted = true;

    const checkSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (mounted && session) {
        navigate('/');
      }
    };
    checkSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted && session) {
        navigate('/');
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [navigate]);

  const validateEmail = (email: string): boolean => {
    if (!email || email.trim() === '') {
      toast.error('Email is required');
      return false;
    }
    if (!email.includes('@')) {
      toast.error('Please enter a valid email address');
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
      toast.error('Password must be at least 6 characters');
      return false;
    }
    return true;
  };

  const validateName = (name: string): boolean => {
    if (!name || name.trim() === '') {
      toast.error('Name is required');
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
        toast.error(error.message || 'Invalid email or password');
      } else if (data.session) {
        toast.success('Welcome back!');
        navigate('/');
      }
    } catch (_error) {
      toast.error('Failed to connect. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();

    if (
      !validateName(signupName) ||
      !validateEmail(signupEmail) ||
      !validatePassword(signupPassword)
    ) {
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
        toast.error(error.message || 'Failed to create account');
      } else if (data.user) {
        if (data.session) {
          toast.success('Account created successfully!');
          navigate('/');
        } else {
          toast.success('Account created! Please check your email to confirm.');
        }
      }
    } catch (_error) {
      toast.error('Failed to connect. Please try again.');
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
        toast.error(error.message || 'Failed to send reset email');
      } else {
        toast.success('Check your email for a password reset link');
        setResetEmail('');
      }
    } catch (_error) {
      toast.error('Failed to connect. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="mesh-gradient relative flex min-h-screen items-center justify-center p-4">
      {/* Decorative elements */}
      <div className="absolute left-0 top-0 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/20 blur-3xl" />
      <div className="absolute bottom-0 right-0 h-96 w-96 translate-x-1/2 translate-y-1/2 rounded-full bg-accent/20 blur-3xl" />

      {/* Theme toggle */}
      <div className="absolute right-4 top-4">
        <ThemeToggle variant="minimal" />
      </div>

      <Card className="glass-card animate-fade-in-up relative w-full max-w-md overflow-hidden border-2 shadow-2xl">
        {/* Card decorative gradient */}
        <div className="gradient-primary absolute right-0 top-0 h-32 w-32 opacity-10 blur-2xl" />

        <CardHeader className="relative space-y-4 text-center">
          <div className="gradient-primary mx-auto flex h-16 w-16 animate-scale-in items-center justify-center rounded-2xl shadow-lg shadow-primary/30">
            <Car className="h-8 w-8 text-white" />
          </div>
          <div>
            <CardTitle className="bg-gradient-to-r from-primary to-accent bg-clip-text text-3xl font-bold text-transparent">
              Park It Easy
            </CardTitle>
            <CardDescription className="mt-2 text-base">
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
                The application is not properly configured. Please contact the administrator to set
                up the required Supabase environment variables.
              </AlertDescription>
            </Alert>
          ) : (
            <Tabs defaultValue="login" className="w-full">
              <TabsList className="grid h-12 w-full grid-cols-3 bg-muted/50 p-1">
                <TabsTrigger
                  value="login"
                  className="data-[state=active]:gradient-primary transition-all data-[state=active]:text-white data-[state=active]:shadow-md"
                >
                  Login
                </TabsTrigger>
                <TabsTrigger
                  value="signup"
                  className="data-[state=active]:gradient-primary transition-all data-[state=active]:text-white data-[state=active]:shadow-md"
                >
                  Sign Up
                </TabsTrigger>
                <TabsTrigger
                  value="reset"
                  className="data-[state=active]:gradient-primary transition-all data-[state=active]:text-white data-[state=active]:shadow-md"
                >
                  Reset
                </TabsTrigger>
              </TabsList>

              <TabsContent value="login" className="mt-6">
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="login-email" className="text-sm font-medium">
                      Email
                    </Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="login-email"
                        type="email"
                        placeholder="your@lht.dlh.de"
                        value={loginEmail}
                        onChange={e => setLoginEmail(e.target.value)}
                        required
                        disabled={isLoading}
                        className="h-12 border-2 pl-10 transition-colors focus:border-primary"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="login-password" className="text-sm font-medium">
                      Password
                    </Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="login-password"
                        type="password"
                        placeholder="••••••••"
                        value={loginPassword}
                        onChange={e => setLoginPassword(e.target.value)}
                        required
                        disabled={isLoading}
                        minLength={6}
                        className="h-12 border-2 pl-10 transition-colors focus:border-primary"
                      />
                    </div>
                  </div>
                  <Button
                    type="submit"
                    className="gradient-primary h-12 w-full font-semibold text-white shadow-lg shadow-primary/30 transition-all hover:scale-[1.02] hover:shadow-primary/50"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Logging in...
                      </>
                    ) : (
                      'Log In'
                    )}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="signup" className="mt-6">
                <form onSubmit={handleSignup} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signup-name" className="text-sm font-medium">
                      Full Name
                    </Label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="signup-name"
                        type="text"
                        placeholder="Your Name"
                        value={signupName}
                        onChange={e => setSignupName(e.target.value)}
                        required
                        disabled={isLoading}
                        className="h-12 border-2 pl-10 transition-colors focus:border-primary"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-email" className="text-sm font-medium">
                      Email
                    </Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="signup-email"
                        type="email"
                        placeholder="your@lht.dlh.de"
                        value={signupEmail}
                        onChange={e => setSignupEmail(e.target.value)}
                        required
                        disabled={isLoading}
                        className="h-12 border-2 pl-10 transition-colors focus:border-primary"
                      />
                    </div>
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <span className="bg-info h-1.5 w-1.5 rounded-full"></span>
                      Only @lht.dlh.de email addresses are allowed
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-password" className="text-sm font-medium">
                      Password
                    </Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="signup-password"
                        type="password"
                        placeholder="••••••••"
                        value={signupPassword}
                        onChange={e => setSignupPassword(e.target.value)}
                        required
                        disabled={isLoading}
                        minLength={6}
                        className="h-12 border-2 pl-10 transition-colors focus:border-primary"
                      />
                    </div>
                  </div>
                  <Button
                    type="submit"
                    className="gradient-primary h-12 w-full font-semibold text-white shadow-lg shadow-primary/30 transition-all hover:scale-[1.02] hover:shadow-primary/50"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Creating account...
                      </>
                    ) : (
                      'Sign Up'
                    )}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="reset" className="mt-6">
                <form onSubmit={handleResetPassword} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="reset-email" className="text-sm font-medium">
                      Email
                    </Label>
                    <div className="relative">
                      <KeyRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="reset-email"
                        type="email"
                        placeholder="your@lht.dlh.de"
                        value={resetEmail}
                        onChange={e => setResetEmail(e.target.value)}
                        required
                        disabled={isLoading}
                        className="h-12 border-2 pl-10 transition-colors focus:border-primary"
                      />
                    </div>
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <span className="bg-info h-1.5 w-1.5 rounded-full"></span>
                      Enter your email to receive a password reset link
                    </p>
                  </div>
                  <Button
                    type="submit"
                    className="gradient-primary h-12 w-full font-semibold text-white shadow-lg shadow-primary/30 transition-all hover:scale-[1.02] hover:shadow-primary/50"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      'Send Reset Link'
                    )}
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
